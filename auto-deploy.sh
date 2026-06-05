#!/bin/bash
# ================================================================
#  自动部署脚本 v3 — 全量同步 + 回滚 + 健康检查
#  检测 main 分支更新，自动拉取并部署到所有实例
#  用法: 通过 cron 定时运行，如: */5 * * * * /opt/poker-source/auto-deploy.sh
# ================================================================

set -uo pipefail

# === 配置 ===
REPO_URL="https://github.com/ZhouXiaoqv/dezhoupuke.git"
BRANCH="main"
GITHUB_API="https://api.github.com/repos/ZhouXiaoqv/dezhoupuke/commits/main"
CLONE_DIR="/opt/poker-source/repo"
SCRIPT_DIR="/opt/poker-source"
LAST_HASH_FILE="$SCRIPT_DIR/.last-deployed-hash"
DEPLOY_LOG="$SCRIPT_DIR/auto-deploy.log"
ROLLBACK_DIR="$SCRIPT_DIR/.rollback"

# 实例配置: 远程目录:端口:PM2进程名
INSTANCES=(
    "/opt/poker-online:3000:poker-online"
    "/opt/poker-online-4000:4000:poker-online-4000"
)

# 同步时排除的目录/文件 (保护运行时数据)
EXCLUDE_DIRS=(
    "node_modules"
    "data"
    ".git"
    "*.log"
)

# 健康检查参数
HEALTH_RETRIES=3
HEALTH_WAIT=5   # 秒

# === 日志函数 ===
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$DEPLOY_LOG"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "$DEPLOY_LOG" >&2
}

# === 构建 rsync exclude 参数 ===
build_rsync_excludes() {
    local args=""
    for pattern in "${EXCLUDE_DIRS[@]}"; do
        args="$args --exclude=$pattern"
    done
    echo "$args"
}

# === 获取 GitHub 最新 commit hash ===
get_latest_commit() {
    local response
    response=$(curl -sS -H "Accept: application/vnd.github.v3+json" "$GITHUB_API" 2>/dev/null)
    if [ $? -ne 0 ]; then
        log_error "GitHub API 请求失败"
        return 1
    fi

    local sha
    sha=$(echo "$response" | grep -m1 '"sha"' | sed 's/.*"sha": *"\([^"]*\)".*/\1/')
    if [ -z "$sha" ]; then
        log_error "无法解析 commit SHA"
        return 1
    fi
    echo "$sha"
}

# === 初始化: 首次运行时克隆仓库 ===
init_repo() {
    if [ ! -d "$CLONE_DIR/.git" ]; then
        log "首次运行，克隆仓库..."
        mkdir -p "$CLONE_DIR"
        git clone -b "$BRANCH" --single-branch "$REPO_URL" "$CLONE_DIR"
        log "仓库克隆完成"
    fi
}

# === 拉取最新代码 ===
pull_latest() {
    cd "$CLONE_DIR"
    git fetch origin "$BRANCH" 2>&1
    git reset --hard "origin/$BRANCH" 2>&1
    log "代码已更新到最新: $(git log --oneline -1)"
}

# === 生成变更摘要 ===
show_changes() {
    local old_hash="$1"
    local new_hash="$2"
    if [ -n "$old_hash" ] && [ -d "$CLONE_DIR/.git" ]; then
        cd "$CLONE_DIR"
        local changes
        changes=$(git log --oneline "${old_hash:0:7}..${new_hash:0:7}" 2>/dev/null || echo "(无法获取变更)")
        if [ -n "$changes" ]; then
            log "变更内容:"
            echo "$changes" | while IFS= read -r line; do
                log "  $line"
            done
        fi

        local diff_stat
        diff_stat=$(git diff --stat "${old_hash:0:7}..${new_hash:0:7}" 2>/dev/null | tail -1)
        if [ -n "$diff_stat" ]; then
            log "文件变更: $diff_stat"
        fi
    fi
}

# === 备份实例 (用于回滚) ===
backup_instance() {
    local remote_base="$1"
    local pm2_name="$2"
    local backup_path="$ROLLBACK_DIR/$pm2_name"

    rm -rf "$backup_path"
    mkdir -p "$backup_path"

    # 只备份关键运行时目录 (不备份 node_modules，回滚时重新安装)
    local excludes
    excludes=$(build_rsync_excludes)
    eval rsync -a "$excludes" "$remote_base/" "$backup_path/" 2>/dev/null

    if [ $? -eq 0 ]; then
        log "  备份 $pm2_name -> $backup_path"
        return 0
    else
        log_error "  备份 $pm2_name 失败"
        return 1
    fi
}

# === 回滚实例 ===
rollback_instance() {
    local remote_base="$1"
    local port="$2"
    local pm2_name="$3"
    local backup_path="$ROLLBACK_DIR/$pm2_name"

    if [ ! -d "$backup_path" ]; then
        log_error "  回滚失败: 无备份 $backup_path"
        return 1
    fi

    log "  回滚 $pm2_name..."
    local excludes
    excludes=$(build_rsync_excludes)
    eval rsync -a --delete "$excludes" "$backup_path/" "$remote_base/" 2>/dev/null

    cd "$remote_base"
    npm install --omit=dev 2>&1 | tail -1

    if pm2 describe "$pm2_name" &>/dev/null; then
        PORT="$port" pm2 restart "$pm2_name" --update-env 2>&1 | tail -1
    else
        PORT="$port" pm2 start "$remote_base/server/index.js" --name "$pm2_name" 2>&1 | tail -1
    fi

    sleep 2
    local http_code
    http_code=$(curl -sS -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null)
    if [ "$http_code" = "200" ]; then
        log "  回滚成功 (HTTP $http_code)"
        return 0
    else
        log_error "  回滚后仍异常 (HTTP $http_code)，需人工介入"
        return 1
    fi
}

# === 健康检查 (带重试) ===
health_check() {
    local port="$1"
    local pm2_name="$2"

    for i in $(seq 1 $HEALTH_RETRIES); do
        local http_code
        http_code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$port" 2>/dev/null)
        if [ "$http_code" = "200" ]; then
            return 0
        fi
        log "  健康检查 $pm2_name 第 ${i}/${HEALTH_RETRIES} 次: HTTP $http_code, ${HEALTH_WAIT}s 后重试..."
        sleep "$HEALTH_WAIT"
    done
    return 1
}

# === 清理重复/残留 PM2 进程 ===
cleanup_stale_pm2() {
    log "检查 PM2 进程状态..."
    local pm2_json
    pm2_json=$(pm2 jlist 2>/dev/null || echo "[]")

    # 检查是否有 errored 或 restart 次数过多的进程
    local stale
    stale=$(echo "$pm2_json" | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        name = p.get('name','')
        status = p.get('pm2_env',{}).get('status','')
        restarts = p.get('pm2_env',{}).get('restart_time', 0)
        if status == 'errored' or restarts > 50:
            print(f'{name}:{status}:{restarts}')
except: pass
" 2>/dev/null || echo "")

    if [ -n "$stale" ]; then
        log "发现异常 PM2 进程:"
        echo "$stale" | while IFS=':' read -r pname pstatus prest; do
            log "  $pname (状态: $pstatus, 重启次数: $prest)"
            if [ "$pstatus" = "errored" ] && [ "$prest" -gt 50 ]; then
                log "  清理异常进程: $pname"
                pm2 delete "$pname" 2>/dev/null || true
            fi
        done
    fi
}

# === 部署单个实例 ===
deploy_instance() {
    local remote_base="$1"
    local port="$2"
    local pm2_name="$3"

    log "部署实例: $pm2_name (端口 $port) -> $remote_base"

    # 1. 备份当前版本
    backup_instance "$remote_base" "$pm2_name"

    # 2. rsync 全量同步 (--delete 会删除目标中多余的文件)
    local excludes
    excludes=$(build_rsync_excludes)
    log "  同步文件 (rsync -a --delete)..."
    eval rsync -av --delete "$excludes" "$CLONE_DIR/" "$remote_base/" 2>&1 | tee -a "$DEPLOY_LOG" | tail -5

    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        log_error "  rsync 同步失败"
        rollback_instance "$remote_base" "$port" "$pm2_name"
        return 1
    fi

    # 3. 确保 data 目录存在 (运行时数据)
    mkdir -p "$remote_base/data"

    # 4. 安装依赖
    cd "$remote_base"
    log "  安装依赖..."
    npm install --omit=dev 2>&1 | tail -3 | tee -a "$DEPLOY_LOG"

    # 5. 清理同名/冲突的旧 PM2 进程
    #    删除端口冲突的僵尸进程
    local existing_port_proc
    existing_port_proc=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        name = p.get('name','')
        env_port = p.get('pm2_env',{}).get('env',{}).get('PORT','')
        if str(env_port) == '$port' and name != '$pm2_name':
            print(name)
except: pass
" 2>/dev/null || echo "")

    if [ -n "$existing_port_proc" ]; then
        log "  发现端口 $port 冲突进程: $existing_port_proc, 清理中..."
        echo "$existing_port_proc" | while read -r old_name; do
            pm2 delete "$old_name" 2>/dev/null || true
            log "  已删除冲突进程: $old_name"
        done
    fi

    # 6. PM2 重启 / 启动
    if pm2 describe "$pm2_name" &>/dev/null; then
        log "  重启 PM2 进程..."
        PORT="$port" pm2 restart "$pm2_name" --update-env 2>&1 | tail -1
    else
        log "  启动 PM2 进程..."
        PORT="$port" pm2 start "$remote_base/server/index.js" --name "$pm2_name" 2>&1 | tail -1
    fi

    # 7. 健康检查 (带重试)
    sleep 3
    if health_check "$port" "$pm2_name"; then
        log "  实例 $pm2_name 部署成功 (端口 $port)"
        return 0
    else
        log_error "  实例 $pm2_name 健康检查失败，执行回滚..."
        pm2 logs "$pm2_name" --lines 10 --nostream 2>&1 | tee -a "$DEPLOY_LOG"
        rollback_instance "$remote_base" "$port" "$pm2_name"
        return 1
    fi
}

# === 主流程 ===
main() {
    # 加锁，防止重复运行
    local lock_file="/tmp/poker-auto-deploy.lock"
    exec 9>"$lock_file"
    if ! flock -n 9; then
        log "另一个部署进程正在运行，跳过本次"
        exit 0
    fi

    # 初始化仓库
    init_repo

    # 获取最新 commit
    local latest_hash
    latest_hash=$(get_latest_commit) || exit 1

    # 读取上次部署的 hash
    local last_hash=""
    if [ -f "$LAST_HASH_FILE" ]; then
        last_hash=$(cat "$LAST_HASH_FILE")
    fi

    # 比较 hash
    if [ "$latest_hash" = "$last_hash" ]; then
        # 无更新，静默退出 (每6次打印一次心跳日志，即30分钟一次)
        local counter_file="$SCRIPT_DIR/.check-counter"
        local counter=0
        if [ -f "$counter_file" ]; then
            counter=$(cat "$counter_file")
        fi
        counter=$(( (counter + 1) % 6 ))
        echo "$counter" > "$counter_file"
        if [ "$counter" -eq 0 ]; then
            log "心跳: 无更新 (commit: ${latest_hash:0:7})"
        fi
        exit 0
    fi

    log "=========================================="
    log "检测到新提交!"
    log "  上次部署: ${last_hash:0:7}"
    log "  最新提交: ${latest_hash:0:7}"
    log "=========================================="

    # 显示变更摘要
    show_changes "$last_hash" "$latest_hash"

    # 拉取最新代码
    pull_latest

    # 清理异常 PM2 进程
    cleanup_stale_pm2

    # 部署所有实例
    local all_ok=true
    local failed_instances=()
    for instance in "${INSTANCES[@]}"; do
        IFS=':' read -r remote_base port pm2_name <<< "$instance"
        if ! deploy_instance "$remote_base" "$port" "$pm2_name"; then
            all_ok=false
            failed_instances+=("$pm2_name")
        fi
    done

    # 保存 PM2 进程列表
    pm2 save 2>&1 | tee -a "$DEPLOY_LOG"

    # 记录已部署的 hash
    if [ "$all_ok" = true ]; then
        echo "$latest_hash" > "$LAST_HASH_FILE"
        log "全部实例部署成功 ✓ (commit: ${latest_hash:0:7})"
    else
        log_error "部分实例部署失败: ${failed_instances[*]}"
        log_error "不更新 hash 记录 (下次 cron 将重试)"
    fi

    log "=========================================="

    # 清理日志 (保留最近 1000 行)
    if [ -f "$DEPLOY_LOG" ]; then
        tail -1000 "$DEPLOY_LOG" > "${DEPLOY_LOG}.tmp"
        mv "${DEPLOY_LOG}.tmp" "$DEPLOY_LOG"
    fi
}

main "$@"
