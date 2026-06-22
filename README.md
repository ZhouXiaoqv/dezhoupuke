# 德州扑克 Online

WebSocket 多人联机德州扑克，服务端权威架构。

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 启动服务
npm start

# 3. 打开浏览器
# http://localhost:3000
```

多个浏览器标签页/设备打开同一地址即可联机。

## 项目结构

```
dezhoupuke/
├── server/                     # 服务端
│   ├── index.js                # 入口：组装模块，启动服务
│   ├── http.js                 # HTTP 静态文件服务
│   ├── ws.js                   # WebSocket 连接管理（心跳、断线）
│   ├── handlers/               # WebSocket 消息处理器
│   │   ├── auth.js             # 用户认证（注册/登录/token）
│   │   ├── room.js             # 房间管理（创建/加入/观战/离开）
│   │   ├── game.js             # 游戏操作（行动/下一手）
│   │   └── misc.js             # 其他（排行榜）
│   ├── stats.js                # 玩家统计追踪
│   ├── room.js                 # Room + RoomRegistry 类
│   ├── game.js                 # 德州扑克游戏引擎
│   ├── userStore.js            # 用户数据持久化（JSON 文件）
│   ├── gameLogger.js           # 牌局日志（对接统一 logger）
│   └── logger.js               # 统一日志模块（按日期轮转写入 data/logs/）
├── public/                     # 前端
│   ├── index.html              # HTML 骨架
│   ├── css/                    # 样式文件
│   │   ├── base.css            # CSS 变量、重置、通用样式
│   │   ├── lobby.css           # 大厅、房间、认证 UI
│   │   ├── table.css           # 牌桌、座位、卡片、动画
│   │   ├── action.css          # 操作面板、音效开关、互动
│   │   ├── components.css      # 头像、排行榜、成就、弹窗
│   │   ├── responsive.css      # 移动端适配
│   │   └── extras.css          # 头像选择、场景切换、操作记录
│   └── js/                     # JavaScript 模块
│       ├── net.js              # WebSocket 网络层
│       ├── ui.js               # UI 工具函数、全局变量
│       ├── sfx.js              # 音效系统（Web Audio API）
│       ├── lobby.js            # 大厅功能（筹码动画、互动、头像）
│       ├── extras.js           # 场景选择、粒子效果、牌型评估
│       ├── game.js             # 游戏渲染（座位、社区牌、状态）
│       ├── actions.js          # 操作面板（加注、弃牌）
│       ├── handlers.js         # WebSocket 事件处理
│       ├── controls.js         # 按钮交互、计时器、结算
│       └── app.js              # 应用入口、自动连接
├── tests/                      # 测试文件
│   ├── unit/                   # 单元测试
│   ├── integration/            # 集成测试
│   ├── e2e/                    # 端到端测试
│   ├── tools/                  # 模拟工具
│   └── screenshots/            # 测试截图
├── data/                       # 运行时数据（用户数据、牌局日志）
├── nginx/                      # Nginx 配置
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── deploy.sh                   # Docker 部署脚本
├── auto-deploy.sh              # 自动部署脚本（git pull + pm2 restart）
├── package.json
└── README.md
```

## 架构设计

### 服务端权威

所有游戏逻辑运行在服务端，客户端只负责渲染和发送操作指令。这防止了客户端作弊。

### 通信协议

**Client → Server:**
| 消息类型 | 数据 | 说明 |
|---------|------|------|
| `user:register` | `{ username, password }` | 注册 |
| `user:login` | `{ username, password }` | 登录 |
| `user:tokenLogin` | `{ token }` | Token 登录 |
| `user:profile` | - | 获取个人资料 |
| `user:setAvatar` | `{ avatar, color }` | 设置头像 |
| `user:setCardBack` | `{ id }` | 装备已拥有牌背 |
| `shop:buyCardBack` | `{ id }` | 使用金币购买牌背 |
| `room:create` | `{ gameMode }` | 创建房间 |
| `room:join` | `{ code }` | 加入房间 |
| `room:spectate` | `{ code }` | 观战 |
| `room:leave` | - | 离开房间 |
| `room:start` | - | 房主开始游戏 |
| `room:ready` | `{ ready }` | 准备/取消 |
| `room:list` | - | 获取在线房间列表 |
| `room:interact` | `{ targetId, emotionId }` | 玩家互动 |
| `game:action` | `{ action, amount }` | 执行操作（fold/check/call/raise/allin） |
| `game:showHand` | `{ show }` | 非摊牌获胜后选择是否展示手牌 |
| `game:nextHand` | - | 跳过等待，立即开始下一手 |
| `stats:get` | `{ sortBy, limit }` | 获取排行榜 |

**Server → Client:**
| 消息类型 | 说明 |
|---------|------|
| `user:loggedIn.dailyCheckIn` | Optional daily check-in reward payload on the first account login of each day |
| `user:registered` | 注册成功 |
| `user:loggedIn` | 登录成功 |
| `user:profile` | 个人资料 |
| `user:avatarUpdated` | 头像已更新 |
| `user:cardBackUpdated` | 牌背已更新 |
| `shop:purchaseResult` | 牌背购买成功 |
| `user:achievement` | 成就解锁 |
| `user:error` | 用户错误 |
| `room:created` | 房间创建成功 |
| `room:joined` | 已加入房间 |
| `room:state` | 房间状态 |
| `room:players` | 玩家列表更新 |
| `room:scoreboard` | 计分板 |
| `room:gameStarted` | 游戏开始 |
| `room:interact` | 玩家互动 |
| `room:error` | 房间错误 |
| `room:left` | 已离开房间 |
| `room:destroyed` | 房间已解散 |
| `room:list` | 房间列表 |
| `game:state` | 游戏状态（按玩家过滤手牌） |
| `game:yourTurn` | 轮到你操作 |
| `game:actionLog` | 操作记录 |
| `game:handStart` | 新一手开始 |
| `game:showdown` | 摊牌 |
| `game:showHandOption` | 非摊牌获胜者可选择是否展示手牌 |
| `game:handShown` | 玩家选择展示手牌 |
| `game:handEnd` | 本手结束 |
| `game:waitingForNext` | 等待下一手 |
| `stats:leaderboard` | 排行榜数据 |

### 房间系统

- 6位随机房间号，易于分享
- 支持 2~8 人
- 房主可开始游戏
- 断线自动检测，15分钟超时自动断开
- 支持断线重连
- 空房间自动清理

### 游戏引擎

- 完整德州扑克规则：翻牌前 → 翻牌 → 转牌 → 河牌 → 摊牌
- 支持 5 种模式：经典、急速、短牌、高额、All-in/Fold
- 完整的牌型评估：高牌到皇家同花顺
- 支持 All-in 和边池
- 自动发牌、自动轮转
- 45秒操作倒计时

## 部署

### 本地开发

```bash
npm run dev   # 使用 --watch 自动重启
```

### 生产部署

```bash
# 设置端口
PORT=8080 npm start

# 使用 PM2 守护进程
npm install -g pm2
pm2 start server/index.js --name poker-online
pm2 save
```

### Docker 部署

```bash
docker compose up -d --build
```

### 自动部署

```bash
# 单次检查更新并部署
bash auto-deploy.sh

# 持续监测模式（每60秒检查一次）
bash auto-deploy.sh --watch
```

## 日志系统

服务端日志统一写入 `data/logs/server-YYYY-MM-DD.log`，每天自动新建文件，保留最近 7 天。格式为 JSONL（每行一条 JSON），方便 `grep`/`jq` 过滤。

### 日志级别

| 级别 | 含义 |
|------|------|
| `DEBUG` | 牌局详细过程（每个行动、阶段切换） |
| `INFO` | 常规运营事件（登录、创建房间、每手结果） |
| `WARN` | 需要关注的异常（断线、心跳超时、认证失败） |
| `ERROR` | 需要排查的错误（存储失败、计分板失衡、运行时异常） |

可通过环境变量 `LOG_LEVEL` 控制最低写入级别（默认 `DEBUG`）。

### 日志分类（category）与事件（event）

**AUTH — 认证**
| event | level | 说明 |
|-------|-------|------|
| `user_register` | INFO | 用户注册成功 |
| `user_login` | INFO | 密码登录成功 |
| `user_token_login` | INFO | Token 自动登录成功 |
| `auth_fail` | WARN | 登录/Token 校验失败 |

**ROOM — 房间**
| event | level | 说明 |
|-------|-------|------|
| `room_create` | INFO | 创建房间 |
| `player_join` | INFO | 玩家加入房间 |
| `player_leave` | INFO | 玩家主动离开 |
| `player_disconnect` | WARN | 玩家断线，等待重连 |
| `player_reconnect` | INFO | 玩家重连成功 |
| `scoreboard_imbalance` | ERROR | 计分板盈亏总和不为零 |

**GAME — 牌局**
| event | level | 说明 |
|-------|-------|------|
| `hand_start` | INFO | 一手牌开始（含座位、盲注配置） |
| `hand_action` | DEBUG | 玩家行动（弃牌/过牌/跟注/加注/All-in） |
| `hand_phase` | DEBUG | 阶段切换（翻牌/转牌/河牌/摊牌，含公共牌、底池） |
| `hand_end` | INFO | 一手牌结束（含赢家、底池分配） |

**NET — 网络**
| event | level | 说明 |
|-------|-------|------|
| `heartbeat_timeout` | WARN | 心跳超时，强制断开连接 |

**SYS — 系统**
| event | level | 说明 |
|-------|-------|------|
| `server_start` | INFO | 服务器启动 |
| `ws_error` | ERROR | WebSocket 连接异常 |
| `userstore_load_fail` | ERROR | 用户数据文件加载失败 |
| `userstore_save_fail` | ERROR | 用户数据文件保存失败 |

### 常用查询示例

```bash
# 查看今天所有 WARN/ERROR
grep -E '"level":"(WARN|ERROR)"' data/logs/server-$(date +%F).log | jq .

# 查某房间的所有事件
grep '"roomCode":"ABCD"' data/logs/server-$(date +%F).log | jq .

# 查计分板失衡记录
grep '"event":"scoreboard_imbalance"' data/logs/server-$(date +%F).log | jq .

# 查某手牌的完整过程（handNum=5）
grep '"handNum":5' data/logs/server-$(date +%F).log | jq .

# 查某玩家的所有断线记录
grep '"event":"player_disconnect"' data/logs/server-$(date +%F).log | jq .
```

## 技术栈

- **后端**: Node.js + ws (WebSocket)
- **前端**: 原生 HTML/CSS/JavaScript（无框架、无构建工具）
- **持久化**: JSON 文件存储
- **音效**: Web Audio API 合成
- **部署**: Docker / PM2 / Nginx 反向代理

## 3D Seat Pets

- Pet models live in `public/assets/pets/models/`, previews in `public/assets/pets/previews/`, and the Kenney CC0 license is kept at `public/assets/pets/License.txt`.
- The frontend uses local Three.js `0.184.0` from `/vendor/three/...`; `public/js/pets3d.js` renders equipped pets as a WebGL overlay on the existing DOM table.
- Player profiles store `ownedPets` and `equippedPet`; public profiles and `game:state.players[]` expose `pet`.
- `user:setPet { id }` equips an owned pet, and `id: ""` unequips.
- `shop:buyBlindBox { id: "pet-blindbox" }` costs 1000 coins, draws only unowned pets, returns `rewardType: "pet"` and `petId`, and does not auto-equip.

## Road Map

- [x] 基础德州扑克（经典/急速/短牌/高额/All-in 模式）
- [x] 用户注册、登录、Token 自动登录
- [x] 房间系统（创建/加入/观战/断线重连）
- [x] 头像选择、成就系统、排行榜
- [x] 牌桌场景主题切换、自定义桌面图片
- [x] 操作记录、计分板
- [ ] 玩家个人数据统计（胜率、手数、收支曲线）
- [ ] 房间内聊天（文字 + 快捷表情）
- [ ] 锦标赛模式（多桌淘汰赛）
- [ ] 牌局回放（手牌历史回顾）
- [ ] AI 机器人（单人练习模式）
- [ ] 多桌同时游戏
