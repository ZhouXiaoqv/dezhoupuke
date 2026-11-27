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

对局中点击右上角的换装按钮，即可更换已拥有的牌背。经典桌还可以更换宠物。

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
│   │   ├── mechanical-table.css # 第二版桌面牌桌
│   │   └── mechanical-controls.css # 机械操作台和桌面功能键
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
│       ├── mechanical-reels.js # 余额、局数和操作台金额的机械滚轮
│       ├── mechanical-payout.js # 派奖筹码的磁吸轨迹和节拍
│       ├── mechanical-notice.js # 发牌机顶部通知铭牌与升降时序
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
| `user:setAvatar` | `{ avatar, color }` | 设置头像（15 款矢量头像 id 或 18 个经典 emoji） |
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
| `game:action` | `{ action, amount, turnDeadline? }` | 执行操作（fold/check/call/raise/allin），机械桌附带当前回合的时限标记 |
| `game:cardsReady` | `{ id }` | 机械桌当前批次的卡牌已完成落位，回传 `game:state.cardGate.id` |
| `game:showHand` | `{ show }` | 经典桌未摊牌获胜后选择是否展示手牌 |
| `game:receiptReady` | `{ receiptId }` | 机械桌结算单已展示，回传 `game:handEnd.receiptId` |
| `game:receiptShowHand` | `{ receiptId }` | 在当前机械桌结算单上公开自己的两张手牌 |
| `game:nextHand` | `{ receiptId? }` | 房主跳过等待，机械桌回传对应的结算单编号 |
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
| `game:state` | 游戏状态（按玩家过滤手牌）。机械桌的 `turn` 包含行动者及剩余时间，`cardGate` 包含本批发牌确认号 `id` 和公共牌起始索引 `boardFrom`（底牌批次为 `null`） |
| `game:yourTurn` | 轮到你操作 |
| `game:actionLog` | 操作记录，加注事件的 `raiseBy` 为本次抬高的注额，超时事件带 `timedOut: true` |
| `game:handStart` | 新一手开始 |
| `game:showdown` | 摊牌 |
| `game:showHandOption` | 经典桌通知未摊牌获胜者可选择展示手牌 |
| `game:handShown` | 玩家已公开手牌，机械桌附 `receiptId` 和 `hand` 更新结算单 |
| `game:handEnd` | 本手结束，机械桌附带 `receiptId` 和可自愿展示手牌的 `showHandPlayerIds` |
| `game:waitingForNext` | 等待下一手，机械桌附带结算单编号、服务端截止时间和剩余毫秒数 |
| `game:receipt` | 恢复当前结算单和下一手的计时状态 |
| `stats:leaderboard` | 排行榜数据 |

### 房间系统

- 6位随机房间号，易于分享
- 经典牌桌支持 2~8 人，机械牌桌支持 2~9 人。创建时选「第二版 · 机械牌桌」，等候室会显示已占和总席位，例如 `1/9 席`。
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
- 机械桌由服务端给每次行动分配 20 秒，超时可过牌时自动过牌，否则自动弃牌

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

创建房间时可以选择第一版经典牌桌或第二版机械牌桌。机械牌桌面向桌面，三段 SVG 机械臂负责发牌、弃牌回收，Canvas 筹码随服务端的本轮下注与底池状态散开、堆叠和收池。各玩家的视角都把自己的座位放在桌底，并保持顺时针座次。机械桌使用 1432 × 832 的固定舞台，窗口先收窄留白，空间不足时整座舞台等比缩小。主操作台和自动跟注盒底沿对齐，窗口窄到两者会重叠时，舞台整体移到自动跟注盒上方。点阵背景铺满窗口，退出、自动跟注和右上角功能键保持屏幕原尺寸。手机点击加入、观战或开始游戏时会尝试进入全屏，并在全屏后请求锁定横屏。右上角可手动切换全屏。竖屏时显示横握引导，横屏后主舞台按动态视口和安全区等比缩放。加注滑杆使用扩大后的触控区，拖动仍按 5 单位吸附。右上角控制座的操作记录和计分板沿双导柱向左推出，切换时先收回当前抽屉，再推出另一扇。操作记录按牌局阶段分段并自动滚到最新条目，计分板显示在座玩家的本场净盈亏。

机械桌的通知从发牌机顶沿背后升起，普通提示亮翠绿灯，结算亮暖金灯，警告亮琥珀红灯。铭牌停留约 2.5 秒，期间收到新通知会先回落半截再换字，最后缩回顶沿遮罩内。

桌下的机械操作台常驻，玩家等待、弃牌或全下后会锁定。轮到行动时，可拖动刻度滑杆或按最小、半池、满池快捷键，再用下注或加注键提交。滑杆从合法最低额起每 5 筹码定格，右端限位对应精确的全下额。加注额由只读滚轮显示；黄色按钮下方的小滚轮显示实际跟注额，过牌时滚回四个零。左下角的自动巡航控制盒用拨片开关联动指示灯和安全滑门。上限由机械滚轮显示，每次按键增减一个大盲注，可长按连调。上限为 0 时仅自动过牌，服务器确认自动操作后灯珠闪烁两次。

公共牌上方的四角铆钉底池铭牌内嵌滚轮，显示本手总额。铭牌底沿固定在公共牌区上方，发牌机与公共牌之间新增 64 像素的纵向空间，供底池筹码自然堆叠。大底池沿公共牌上方往两侧铺开，重叠时盖在各席下注筹码前方，机械臂绘制在筹码上方。底池与各席下注均按实际面值和枚数绘制，高出桌沿的筹码与越过桌边的阴影会完整显示。下注确认后，本次新增的筹码从卡座舌片错峰弹出，先散开再聚进原下注堆。换轮时等这批筹码落位后再播收池动画，牌局照常推进。五张公共牌按翻牌、转牌、河牌分为 3+1+1，直接落在桌布上。摊牌时，赢家成牌用到的公共牌本身亮起暖金细边。九段磨砂玻璃灯柱位于牌桌左侧卡座之外，随主舞台一起缩放，只用自己的手牌和已亮出的公共牌评估牌力。两根亮银立柱由三道黄铜抱箍连接。底座三格 24 像素分体翻页窗显示牌型，翻完后每格以单个字形对齐折缝，两字牌型时第三格留空。同花顺点满九段，皇家同花顺还会触发金色扫光和顶灯脉冲。行动倒计时沿头像框内侧的深炭灰圆角方槽顺时针消退，3.75 像素的翠绿灯带带有跟随光点。最后五秒切换为琥珀红光，与座位指示灯同步快闪。超时弃牌由原有机械臂队列回收。下注、收筹码和滑杆棘轮音效均由 Web Audio 合成，并由右上角音效开关控制。

机械桌每批底牌和公共牌落位后由在线玩家端确认。服务端收到确认后才启动行动倒计时、推进下一批全下公共牌或结算。弃牌逐张回收，当前下注轮可马上交给下一位玩家。若弃牌回收排在下一批发牌之前，机械臂按原有队列顺序处理。后台标签页和减少动态效果模式直接落位，断线玩家退出本批等待，未收到确认的批次有服务端时限。结算小票等待最后一枚底池筹码落袋后进入走纸阶段。

筹码面值为 1、5、10、20、50、100。默认 2000 开局按 100、50、20、10 各 10 枚、5 元 20 枚、1 元 100 枚发放。服务器维护玩家的私有库存。下注先从库存中找能凑齐的组合，找不到才拆换大面值。收池保留桌上的筹码，派奖和退款从底池扣出相应面值，余额库存随牌局延续。其他档位按各自的起始金额配筹。

牌桌只展示本轮下注和底池的筹码，金额标签可查看桌面筹码明细。机械桌关闭表情互动和座位宠物。手牌使用收牌玩家的牌背，公共牌翻开前使用自己装备的牌背，观战视角沿用默认牌背。机械臂在吐牌前选定该张牌的皮肤，换装时已经出仓的牌会沿用原牌背直到落位，尚未出仓的牌使用最新设置。每手结束后，底座下方步进吐出接近出纸口宽度的结算小票，机械臂夹住纸边抽离，小票随后移到桌面中央放大。小票列出总底池、公共牌、已公开手牌、牌型和每位玩家的实际净输赢。在线玩家的小票展示完成后，票尾统一倒计时 20 秒。房主可提前开始下一手，其他玩家在同一位置看到等待提示。进入下一手时随即收起小票。隐藏页面和减少动态效果模式直接展示票据，重新连接会恢复当前小票和剩余时间。

机械牌桌始终保留九个卡座。居中的发牌机两侧各一席，左右桌沿各两席，底部三席，自己固定在底部正中。空位显示凹槽、暗滚轮及熄灭的灯牌，入座后显示头像、姓名和筹码余额。头像下方的浅暖灰嵌入灯条将 D、SB、BB 排在同一条凹槽里，按当前身份独立点亮。连接舌片朝向桌心，手牌贴着舌片落位，下注筹码在各席手牌旁错位堆叠，顶部左右席的筹码向两侧摆放。大额下注保留多摞筹码的高低变化和完整软投影。筹码堆交叠时，桌面位置靠下的筹码堆显示在前方。牌与筹码交错时优先显示筹码。轮到行动时亮绿灯，收池时亮暖金灯。余额使用至少五位独立滚轮，扣款向下滚动，进账向上滚动。结算时由外圈到内圈依次剥离每摞堆顶，把桌面上的底池筹码逐枚送至收款座位。筹码越多，吸收持续越久，后半程发射逐渐加快。余额随实际命中更新，在最后一枚命中时开始卡位，最终显示服务端余额。系统的减少动态效果设置会跳过飞行动画和滚动。

弃牌玩家和未摊牌获胜的玩家可在结算小票底部点击“展示手牌”，按钮位于下一手按钮左侧。点击后，自己的两张手牌会出现在所有人的小票上，重连时也会保留。未选择展示的手牌保持隐藏，下一手倒计时继续运行。

机械臂通过 `arm.enqueue(name, task)` 或 `arm.enqueue(name, tasks)` 调度发手牌、翻公共牌、弃牌和拉取结算小票。任务提供桌面坐标或坐标回调，可附加 DOM 道具以及抓取、携带、释放和落地回调。预设组合取物、摆出、刹停、悬停和释放，并指定底座灯色、仓门和平滑归位参数。底座仓室带滑轨和出牌滚轮，机械臂的连杆和轴承投影随伸展距离和抬升调整。`MechanicalArmPresets.giftExample` 演示悬停和轻抛落地，可注册到独立的控制器验证扩展接口。

肩部滑台沿整条导轨跟进。三节刚性大臂套筒和液压活塞沿轴滑移，双连杆读取两端偏心销轴，肘部夹角硬限位为 25–155°。腕部有 32 像素的独立双光轴行程，用于直线抽牌、放牌和塞牌。出仓牌、公共牌和自己的手牌使用同一尺寸。发牌口用约 140 毫秒吐出约 57% 的牌身，夹爪夹住露出的牌边后抽离。发公共牌和自己的手牌时，末端夹爪在松爪前沿腕轴带牌翻面，花色始终对齐牌面中心。发向对手的牌背面朝上，松爪后用约 150 毫秒缩到展示尺寸。对手的弃牌在夹离座位后恢复标准尺寸，正对碎牌口插入约六成再松爪。出仓和回收的卡牌均从槽口下唇边上方经过，在深色缝隙的中线处裁切。碎牌口继续卷入直至吞没牌身，前后每张独立处理。机械臂在队列清空后折回圆角底座的托架。底座上层集成局数滚轮、阶段翻页牌和盲注铭牌。

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
