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

加注增量达到 500 时，金色光带从行动座位沿桌边绕行。全下触发红金双向光带和独立音效；音效跟随静音开关，开启减少动态效果时桌沿显示静态高亮。

对局中点击右上角音效开关旁的 👕 图标，即可更换已拥有的牌背和宠物。保存后同桌即可看到。

单人测试可创建房间，点击 **添加人机**，再点击 **开始游戏**。每次添加一个，最多八人同桌。人机有注跟注、无注过牌，筹码不足时跟到全下；全下或弃牌模式遵循该模式规则。

在大厅进入 **LAYOUT · 布局测试房间**，点击桌底的 **加注 +500** 或 **全下 ALL IN** 即可单人预览特效与音效。

翻牌前亮牌统一显示「一对」或「高牌」。赢家摊牌或主动亮牌后，座位铭牌会保留本手牌型，直到下一手开始。

点击其他玩家的铭牌可以发送局内表情。表情先飞向对方铭牌，再在铭牌上播放命中动画并伴随音效，连续发送的每个表情都会完整播放。表情定义在 `server/emotionCatalog.js`，管理员可在后台「局内表情」中调整价格、魅力、排序和上下架。每位玩家可连续发送 8 个，之后每秒恢复 4 个。动画在 `public/js/emotionRigs.js`，用到的 SVG 部件在 `public/assets/emotions/<id>/`。

## 本地测试

安装开发依赖并准备好 Chrome 后，运行 `npm test`。测试会在本机随机端口启动独立服务，账号、商品和日志都写入临时目录，结束后自动清理。浏览器默认使用已安装的 Google Chrome，可用 `POKER_BROWSER` 指定其他 Chrome 或 Chromium 可执行文件的完整路径。

| 命令 | 覆盖范围 |
| --- | --- |
| `npm run test:unit` | 直接验证牌局引擎、边池、账号、商店与局内表情规则 |
| `npm run test:network` | 通过 WebSocket 验证管理权限、房间生命周期、行动轮转和表情限流 |
| `npm run test:browser` | 检查公共牌复用、宠物异步加载和四种窗口尺寸的筹码布局、宠物遮挡、单人建房与人机对局，以及连续表情动画 |
| `npm run test:screenshots` | 可选的双人对局截图，保存到 `tests/screenshots/` 供人工检查 |

`npm test` 依次运行前三组。仅运行规则或联网测试时，无需安装浏览器。

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
│   ├── userStore.js            # 用户数据持久化（JSON 文件，节流异步写入）
│   ├── catalogStore.js         # 商店、盲盒、表情等可后台管理的目录
│   ├── emotionCatalog.js       # 局内表情定义（价格、魅力）
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
│   │   ├── extras.css          # 头像选择、场景切换、操作记录
│   │   └── mechanical-table.css # 第二版桌面牌桌
│   ├── assets/cardbacks/       # 图片牌背资源（onepiece、cute 等主题）
│   ├── assets/emotions/        # 局内表情 SVG 部件与面板图标
│   └── js/                     # JavaScript 模块
│       ├── net.js              # WebSocket 网络层
│       ├── ui.js               # UI 工具函数、全局变量
│       ├── sfx.js              # 音效系统（Web Audio API）
│       ├── emotionFx.js        # 局内表情 Canvas 特效层
│       ├── emotionRigs.js      # 五个局内表情的动画
│       ├── lobby.js            # 大厅功能（筹码动画、互动面板、头像）
│       ├── extras.js           # 场景选择、粒子效果、牌型评估
│       ├── game.js             # 游戏渲染（座位、社区牌、状态）
│       ├── mechanical-arm-rig.js # 逆向运动学、连杆造型与双层软投影
│       ├── mechanical-arm-presets.js # 动作阶段、节拍和硬件反馈
│       ├── mechanical-arm-actions.js # 动作队列、挂载物和释放交接
│       ├── mechanical-reels.js # 座位余额和局数机械滚轮
│       ├── mechanical-payout.js # 派奖筹码的磁吸轨迹和节拍
│       ├── mechanical-table.js # 牌桌事件、筹码动画、单手结算
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
├── tools/                      # 素材生成脚本
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
| `room:create` | `{ gameMode, tableStyle }` | 创建房间，样式为 `classic`（默认）或 `mechanical` |
| `room:join` | `{ code }` | 加入房间 |
| `room:spectate` | `{ code }` | 观战 |
| `room:leave` | - | 离开房间 |
| `room:start` | - | 房主开始游戏 |
| `room:ready` | `{ ready }` | 准备/取消 |
| `room:list` | - | 获取在线房间列表 |
| `room:interact` | `{ targetId, emotionId }` | 发送局内表情（限流，超出时返回 `room:error`） |
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
| `room:interact` | 局内表情：`{ fromId, toId, emotion, targetCharm }` |
| `room:error` | 房间错误 |
| `room:left` | 已离开房间 |
| `room:destroyed` | 房间已解散 |
| `room:list` | 房间列表 |
| `game:state` | 游戏状态（按玩家过滤手牌） |
| `game:yourTurn` | 轮到你操作 |
| `game:actionLog` | 操作记录，加注事件的 `raiseBy` 为本次抬高的注额 |
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

## 房间样式

创建房间时可以选择第一版经典牌桌或第二版机械牌桌。机械牌桌面向桌面，三段 SVG 机械臂负责发牌、弃牌回收，Canvas 筹码随服务端的本轮下注与底池状态散开、堆叠和收池。各玩家的视角都把自己的座位放在桌底，并保持顺时针座次。

筹码面值为 1、5、10、20、50、100。默认 2000 开局按 100、50、20、10 各 10 枚、5 元 20 枚、1 元 100 枚发放。服务器维护玩家的私有库存。下注先从库存中找能凑齐的组合，找不到才拆换大面值。收池保留桌上的筹码，派奖和退款从底池扣出相应面值，余额库存随牌局延续。其他档位按各自的起始金额配筹。

牌桌只展示本轮下注和底池的筹码，金额标签可查看桌面筹码明细。第二版使用固定占位牌背，关闭表情互动和座位宠物，单手结束后显示公共牌、已公开手牌、获胜金额及退回筹码。

座位余额使用至少五位独立滚轮，扣款向下滚动，进账向上滚动。结算时根据实际转移的面值采样 12–24 枚视觉筹码，错峰飞向收款座位，余额跟随筹码入账节奏并停在服务端余额。系统的减少动态效果设置会跳过飞行动画和滚动。

机械臂通过 `arm.enqueue(name, task)` 或 `arm.enqueue(name, tasks)` 调度发手牌、翻公共牌和弃牌。任务提供桌面坐标或坐标回调，可附加 DOM 道具以及抓取、携带、释放和落地回调。预设组合取物、摆出、刹停、悬停和释放，并指定底座灯色、仓门和平滑归位参数。底座仓室带滑轨和出牌滚轮，机械臂的连杆和轴承投影随伸展距离和抬升调整。`MechanicalArmPresets.giftExample` 演示悬停和轻抛落地，可注册到独立的控制器验证扩展接口。

大臂液压杆连接底座和肘部凸耳，前臂两根连杆采用独立偏心销，腕部可指定独立朝向。每张手牌和公共牌都单独从仓室取出。释放时夹爪弹开，顶针短行程推出。机械臂随后回仓取下一张，队列清空后横卧在底座下半部，夹爪收至右侧停泊托架。底座上层集成局数滚轮、阶段翻页屏和盲注铭牌。

## 3D Seat Pets

- Pet models live in `public/assets/pets/models/`, previews in `public/assets/pets/previews/`, and the Kenney CC0 license is kept at `public/assets/pets/License.txt`.
- The frontend uses local Three.js `0.184.0` from `/vendor/three/...`; `public/js/pets3d.js` renders equipped pets as a WebGL overlay on the existing DOM table.
- Player profiles store `ownedPets` and `equippedPet`; public profiles and `game:state.players[]` expose `pet`.
- `user:setPet { id }` equips an owned pet, and `id: ""` unequips.
- `shop:buyBlindBox { id: "pet-blindbox" }` costs 1000 coins, draws only unowned pets, returns `rewardType: "pet"` and `petId`, and does not auto-equip.

## 主题牌背盲盒

- 精品牌背拆分为两个 1000 金币盲盒：`onepiece-cardback-blindbox` 包含 15 张海贼王主题牌背，`cute-cardback-blindbox` 包含 9 张可爱水果动物风牌背。
- 24 张精品牌背不公开单独售卖，也不会进入普通牌背盲盒；玩家已经拥有的牌背不受影响。
- 每个主题盲盒只从自己奖池中尚未拥有的牌背等概率抽取，不会重复；对应奖池全部集齐后不能继续购买。
- 管理员后台的“盲盒管理”支持新增盲盒、选择牌背奖池并从奖池中指定封面、修改价格和排序，并通过“上架”状态控制商城展示。
- 点击盲盒可查看更大的牌背预览、完整奖池、拥有状态和收集进度。

## Road Map

- [x] 基础德州扑克（经典/急速/短牌/高额/All-in 模式）
- [x] 用户注册、登录、Token 自动登录
- [x] 房间系统（创建/加入/观战/断线重连）
- [x] 头像选择、成就系统、排行榜
- [x] 送礼更新保留当前公共牌，离开牌桌后停止宠物动画
- [x] 玩家座位旁的筹码堆显示本轮累计下注，换轮后清空
- [x] 默认象牙白横向圆角牌桌，支持场景主题切换和自定义桌面图片
- [x] 操作记录、计分板
- [ ] 玩家个人数据统计（胜率、手数、收支曲线）
- [ ] 房间内聊天（文字 + 快捷表情）
- [ ] 锦标赛模式（多桌淘汰赛）
- [ ] 牌局回放（手牌历史回顾）
- [ ] AI 机器人（单人练习模式）
- [ ] 多桌同时游戏
