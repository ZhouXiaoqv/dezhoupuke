# AGENTS.md

## Cursor Cloud specific instructions

### 产品概览

单产品 **poker-online**（德州扑克 Online）：一个 Node.js 进程同时提供 HTTP 静态前端与 WebSocket 游戏服务，默认端口 **3000**。无数据库、无前端构建步骤；用户数据写入 `data/users.json`（运行时自动创建）。

### 常用命令

| 操作 | 命令 |
|------|------|
| 安装依赖 | `npm install` |
| 开发模式（热重载） | `npm run dev` |
| 生产模式 | `npm start` |
| 离线游戏引擎测试 | `node test/test-all-scenarios.js` |
| 边池退款测试 | `node test/test-sidepot-refund.js` |

### 启动服务

在 tmux 中后台运行（推荐）：

```bash
SESSION_NAME="poker-dev-server"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null \
  || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "/workspace" -- "${SHELL:-bash}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" 'cd /workspace && npm run dev' C-m
```

浏览器访问：`http://localhost:3000`

### 认证协议（重要）

当前服务端要求 **`user:register` / `user:login` / `user:tokenLogin`**。`tests/` 下部分 WebSocket 集成测试仍使用已废弃的 `auth` 消息，会在连接后挂起或失败；**不要**将其作为环境是否就绪的判断依据。请使用 `test/` 离线测试或浏览器 E2E 验证。

### Lint

项目根目录 **无 ESLint/Prettier 配置**，`package.json` 中也无 `lint` 脚本。

### Docker（可选）

`docker compose up` 可容器化运行，本地开发通常不需要。生产 compose 见 `docker-compose.prod.yml`（含 Nginx）。
