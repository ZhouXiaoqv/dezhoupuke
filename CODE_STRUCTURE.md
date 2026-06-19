# 开发者接手手册

本文档面向准备维护、修 bug、加功能的开发人员。目标不是只看懂目录，而是帮助你理解项目的运行模型、模块边界、状态流、协议流、测试方法和常见改动入口。

项目是一个在线德州扑克 Web 应用，采用“服务端权威”架构：浏览器只负责展示和提交操作，房间状态、牌局规则、发牌、下注、结算、Bot 决策都由服务端统一计算。

## 1. 快速结论

### 项目类型

- 多人实时 Web 游戏
- Node.js 后端 + 原生前端单页应用
- WebSocket 双向通信
- 服务端内存房间状态
- JSON 文件持久化用户数据和牌局日志

### 核心文件

```text
server/index.js      WebSocket 协议入口 + HTTP 静态服务
server/room.js       房间、玩家、观战者、Bot 房间编排
server/game.js       德州扑克核心规则引擎
server/userStore.js  用户、签到、成就、排行榜
server/gameLogger.js 每手牌日志
public/index.html    前端单页应用，包含 HTML/CSS/JS
```

### 开发时最常读的 5 个位置

- `server/index.js` 的 `switch (type)`：所有客户端消息入口
- `server/room.js` 的 `Room`：房间状态和游戏生命周期
- `server/game.js` 的 `Game`：牌局状态机和规则
- `public/index.html` 的 `Net`：前端 WebSocket 封装
- `public/index.html` 的 `Net.on(...)`：前端处理服务端事件

## 2. 技术栈

### 后端

- Node.js 18+
- 原生 `http`：提供静态文件
- `ws`：WebSocket 服务
- 原生 `fs/path/crypto`：文件读写、路径、随机 ID、token、hash
- 无数据库，数据写入本地 `data/`

### 前端

- 单文件 `public/index.html`
- 原生 HTML/CSS/JavaScript
- WebSocket：实时通信
- WebRTC：语音聊天媒体连接
- Web Audio API：音效、音乐
- LocalStorage：保存 token 和用户偏好

### 部署

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `nginx/default.conf`

Nginx 配置里已经包含 WebSocket 所需的 `Upgrade` 和 `Connection` 头。

## 3. 目录结构

```text
dezhoupuke/
├─ server/
│  ├─ index.js
│  ├─ room.js
│  ├─ game.js
│  ├─ userStore.js
│  └─ gameLogger.js
├─ public/
│  └─ index.html
├─ tests/
│  ├─ test-room.js
│  ├─ test-turn.js
│  ├─ test-voice.js
│  ├─ test-bugs.js
│  ├─ test-bugs-unit.js
│  └─ test-browser.js
├─ test/
│  ├─ simulate-game.js
│  └─ test-all-scenarios.js
├─ nginx/
│  └─ default.conf
├─ package.json
├─ package-lock.json
├─ Dockerfile
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ deploy.sh
├─ PROJECT_HANDOFF.md
└─ README.md
```

注意：当前 README 和源码中的部分中文在某些终端下会显示乱码，大概率是历史编码或终端解码问题。修文案时建议用支持 UTF-8 的编辑器确认真实内容。

## 4. 启动和运行

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

实际执行：

```bash
node server/index.js
```

### 开发模式

```bash
npm run dev
```

实际执行：

```bash
node --watch server/index.js
```

### 默认访问

```text
HTTP: http://localhost:3000
WS:   ws://localhost:3000
```

端口由 `server/index.js` 读取：

```js
const PORT = process.env.PORT || 3000;
```

## 5. 整体架构

### 关键设计

服务端保存权威状态，客户端不直接决定游戏结果。

```text
浏览器
  -> 发送操作：创建房间、加入房间、下注、弃牌
  -> 接收状态：房间列表、玩家列表、牌桌状态、轮到谁行动

服务端
  -> 校验操作是否合法
  -> 推进房间和牌局状态
  -> 对每个玩家发送过滤后的游戏状态
  -> 计算赢家和筹码变化
```

这个设计可以避免客户端作弊，例如自己改手牌、强行操作非自己回合、查看别人底牌等。

### 运行时对象关系

```text
server/index.js
  owns RoomRegistry
  owns UserStore
  owns playerSockets

RoomRegistry
  owns Map<roomCode, Room>
  owns Map<playerId, roomCode>

Room
  owns Map<playerId, roomPlayer>
  owns Map<spectatorId, spectator>
  owns Game when gameRunning

Game
  owns players[]
  owns deck/community/pot/phase/currentIdx
  owns betting and showdown logic
```

## 6. 请求和状态流

### 页面加载

```text
浏览器 GET /
  -> server/index.js HTTP server
  -> public/index.html
  -> 浏览器加载单页应用
```

`server/index.js` 会把 `/` 映射到 `/index.html`，再从 `public/` 目录读取文件。

### 建立 WebSocket

前端入口在 `public/index.html` 的 `Net` 对象：

```js
const Net = {
  ws: null,
  playerId: null,
  handlers: {},

  connect(url) {},
  send(type, data = {}) {},
  on(type, handler) {},
  emit(type, data) {},
  auth(name) {},
};
```

统一消息格式：

```json
{
  "type": "room:create",
  "data": {}
}
```

### 服务端消息分发

入口在 `server/index.js`：

```js
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  const { type, data = {} } = msg;

  switch (type) {
    // auth / user / room / game / voice
  }
});
```

新增协议时，绝大多数情况从这里加 `case`。

## 7. 后端模块详解

### 7.1 `server/index.js`

这是后端入口和协议层。

主要职责：

- 启动 HTTP 静态资源服务
- 启动 WebSocket 服务
- 维护连接心跳
- 给玩家分配或恢复 `playerId`
- 维护 `playerSockets`
- 初始化 `RoomRegistry`
- 初始化 `UserStore`
- 处理用户系统消息
- 处理房间系统消息
- 处理游戏操作消息
- 转发 WebRTC 语音信令
- 记录排行榜统计
- 推送成就解锁

重要全局对象：

```js
const userStore = new UserStore();
const wss = new WebSocketServer({ server: httpServer });
const registry = new RoomRegistry();
const playerSockets = new Map();
```

每个 WebSocket 连接内部会保存这些局部变量：

```js
let playerId = null;
let currentRoom = null;
let currentUser = null;
```

这些变量只属于当前连接。断线后会在 `close` 事件中清理或通知房间。

常见修改入口：

- 新增客户端消息：加 `case 'xxx'`
- 新增服务端事件：用 `ws.send(JSON.stringify(...))` 或 `room.broadcast(...)`
- 改登录逻辑：看 `user:register`、`user:login`、`user:tokenLogin`
- 改房间行为入口：看 `room:create`、`room:join`、`room:start`
- 改游戏操作入口：看 `game:action`
- 改语音信令：看 `voice:*`

### 7.2 `server/room.js`

房间层是连接“协议入口”和“游戏引擎”的中间层。

#### `RoomRegistry`

负责全局房间表：

```js
this.rooms = new Map();
this.playerRoom = new Map();
```

核心方法：

- `generateCode()`：生成房间号
- `createRoom()`：创建房间
- `joinRoom()`：加入房间或重连
- `spectateRoom()`：观战
- `leaveRoom()`：离开房间
- `getRoomList()`：大厅房间列表
- `cleanup()`：清理无连接房间

#### `Room`

负责单个房间状态：

```js
this.players = new Map();
this.spectators = new Map();
this.game = null;
this.gameRunning = false;
this.hostId = hostId;
```

核心方法：

- `addPlayer()`：加入玩家
- `removePlayer()`：玩家离开或断开
- `handleReconnect()`：玩家重连
- `addSpectator()`：加入观战
- `removeSpectator()`：离开观战
- `setReady()`：准备状态
- `startGame()`：创建 `Game` 并开始第一手
- `startBotGame()`：添加 Bot 并自动开始
- `handlePlayerAction()`：把玩家操作转给 `Game`
- `routeVoiceSignal()`：转发 WebRTC 信令
- `broadcastPlayerList()`：广播玩家列表
- `destroy()`：销毁房间

房间层需要特别关注两个概念：

- 房主转移：房主离开后，`removePlayer()` 会把房主转给剩余第一个玩家。
- 空房宽限：最后一个人离开后不会立刻销毁，而是设置 5 分钟 `destroyTimer`。

### 7.3 `server/game.js`

游戏引擎是项目最重要的业务模块。

#### 主要状态

`Game` 构造函数里维护：

```js
this.players = [];
this.deck = [];
this.community = [];
this.pot = 0;
this.dealerIdx = Math.floor(Math.random() * this.players.length);
this.currentIdx = 0;
this.phase = 'idle';
this.minRaise = this.bb;
this.lastRaise = this.bb;
this.roundBet = 0;
this.actedCount = 0;
this.handNum = 0;
this.winners = [];
this.actionTimeout = null;
```

玩家对象大致包含：

```js
{
  id,
  name,
  seatIdx,
  stack,
  hand,
  bet,
  totalBet,
  folded,
  allIn,
  lastAction,
  connected,
  isBot,
  botStyle,
  avatar,
  avatarColor
}
```

#### 牌局状态机

```text
idle
  -> preflop
  -> flop
  -> turn
  -> river
  -> showdown
```

关键方法：

- `startHand()`：开始一手牌
- `postBlind()`：下盲注
- `processNextAction()`：决定下一个行动玩家
- `handleAction()`：处理 fold/check/call/raise/allin
- `advancePhase()`：推进到 flop/turn/river/showdown
- `showdown()`：摊牌和边池结算
- `endHand()`：其他人都弃牌时提前结束
- `handleDisconnect()`：断线处理
- `handleReconnect()`：重连恢复状态

#### 私有手牌保护

不要直接把 `getState()` 广播给所有玩家。当前设计是：

- `getStateForPlayer(playerId)`：只给当前玩家自己的手牌
- `getStateForSpectator()`：观战者看不到未摊牌手牌
- `broadcastState()`：逐个玩家发送过滤后的状态

这是防作弊关键点，改动时要很小心。

#### Bot 逻辑

Bot 在 `botDecide(player)` 中做决策。

支持风格：

- `tag`：紧凶
- `lap`：松弱/跟注型
- `maniac`：激进
- `rock`：紧弱

判断方式：

- 翻牌前用 `_ratePreflopHand()`
- 翻牌后用 `_simulateHandStrength()` 做简化蒙特卡洛估算

### 7.4 `server/userStore.js`

这是轻量用户系统。

数据文件：

```text
data/users.json
```

主要职责：

- 注册
- 登录
- token 校验
- 用户资料
- 筹码
- 每日签到
- 头像设置
- 游戏统计
- 成就解锁
- 排行榜

重要方法：

- `register(username, password)`
- `login(username, password)`
- `validateToken(token)`
- `getProfile(username)`
- `recordGame(username, data)`
- `checkin(username)`
- `getCheckinInfo(username)`
- `updateAvatar(username, avatar, color)`
- `getLeaderboard(sortBy, limit)`

安全注意：当前密码使用 SHA-256 + 固定 salt，这不适合正式生产。正式上线建议改为 `bcrypt` 或 `argon2`，并设计 token 过期策略。

### 7.5 `server/gameLogger.js`

用于记录每手牌细节。

输出文件：

```text
data/game-hands.jsonl
```

主要记录：

- 手牌编号
- 时间
- 盲注配置
- 玩家座位
- 玩家手牌
- 行动序列
- 公共牌阶段
- 赢家和结算

排查游戏规则 bug 时，这个日志很有价值。

## 8. 前端结构详解

### 8.1 单文件结构

`public/index.html` 同时包含：

- HTML 页面结构
- CSS 样式
- JavaScript 逻辑

优点是部署简单，缺点是文件非常长。改功能时建议用搜索定位。

### 8.2 主要前端状态

常见全局状态包括：

```js
let authToken = localStorage.getItem('poker_token') || null;
let userProfile = null;
let isRegistered = false;
let selectedGameMode = 'classic';
let roomCode = null;
let isHost = false;
let isSpectator = false;
let myReady = false;
```

具体变量以源码为准，改 UI 时要确认这些状态和服务端事件是否同步。

### 8.3 前端网络层

`Net` 的工作方式：

```text
Net.connect()
  -> new WebSocket()
  -> onmessage
  -> JSON.parse
  -> Net.emit(type, data)
  -> 调用 Net.on 注册的处理函数
```

发送消息：

```js
Net.send('game:action', { action: 'call' });
```

接收消息：

```js
Net.on('game:state', (state) => {
  renderGame(state);
});
```

### 8.4 主要 UI 函数

建议熟悉这些函数：

- `showScreen(id)`：页面切换
- `toast(msg)`：轻提示
- `showError(msg)`：错误提示
- `renderGame(state)`：牌桌渲染核心
- `showActions(data)`：显示操作面板
- `hideActions()`：隐藏操作面板
- `startRoomListRefresh()`：大厅房间列表刷新
- `renderProfile(profile)`：用户资料渲染
- `showAchievementToast(ach)`：成就提示
- `attemptReconnect()`：断线重连
- `startTurnTimer(timeLimit)`：行动倒计时
- `showSettlement(winners)`：结算弹窗

### 8.5 前端事件处理

前端底部有大量 `addEventListener`，它们是按钮入口。

常见入口：

- 创建房间：`createRoomBtn`
- 人机局：`botGameBtn`
- 加入房间：`joinRoomBtn`
- 离开房间：`leaveRoomBtn`
- 准备：`readyBtn`
- 开始游戏：`startGameBtn`
- 弃牌/过牌/跟注/加注/All-in：`btnFold`、`btnCheck`、`btnCall`、`btnRaise`、`btnAllin`
- 排行榜：`leaderboardBtn`
- 观战：`spectateLink`
- 语音：`voiceToggle`

## 9. WebSocket 协议

### 9.1 客户端发给服务端

用户：

```text
auth
user:register
user:login
user:tokenLogin
user:profile
user:achievements
user:checkin
user:checkinInfo
user:setAvatar
```

房间：

```text
room:list
room:create
room:join
room:spectate
room:leave
room:start
room:ready
room:botGame
room:interact
```

游戏：

```text
game:action
game:nextHand
```

语音：

```text
voice:join
voice:leave
voice:offer
voice:answer
voice:ice-candidate
```

统计：

```text
stats:get
```

### 9.2 服务端发给客户端

用户：

```text
auth:ok
user:registered
user:loggedIn
user:profile
user:achievementsList
user:achievement
user:checkin
user:checkinInfo
user:avatarUpdated
user:error
```

房间：

```text
room:created
room:joined
room:left
room:state
room:players
room:playerJoined
room:playerLeft
room:spectatorJoined
room:spectatorLeft
room:hostChanged
room:gameStarted
room:list
room:error
room:destroyed
room:interact
```

游戏：

```text
game:state
game:handStart
game:yourTurn
game:showdown
game:handEnd
game:waitingForNext
game:error
```

统计：

```text
stats:leaderboard
```

语音：

```text
voice:join
voice:leave
voice:offer
voice:answer
voice:ice-candidate
```

### 9.3 协议开发规范

新增协议时建议遵循：

```text
domain:action
```

例如：

```text
chat:send
chat:history
room:kick
game:rebuy
```

推荐返回：

```text
domain:ok
domain:error
```

或直接广播具体事件：

```text
chat:message
room:playerKicked
```

## 10. 关键业务流程

### 10.1 创建房间

```text
点击创建房间
  -> Net.connect()
  -> Net.auth(name)
  -> Net.send('room:create', { name, gameMode })
  -> index.js case 'room:create'
  -> registry.createRoom()
  -> new Room()
  -> Room.addPlayer()
  -> room:created
  -> room.broadcastPlayerList()
  -> 前端 showScreen('roomScreen')
```

### 10.2 加入房间

```text
输入房间号
  -> Net.send('room:join', { code, name })
  -> registry.joinRoom()
  -> Room.addPlayer()
  -> room:state
  -> room:joined
  -> room:players
```

### 10.3 开始游戏

```text
房主点击开始
  -> Net.send('room:start')
  -> Room.startGame(playerId)
  -> 校验房主
  -> 校验至少 2 名在线玩家
  -> new Game(players, options)
  -> game.startHand()
```

### 10.4 玩家行动

```text
Game.processNextAction()
  -> 如果当前玩家是 Bot，调用 botDecide()
  -> 如果是真人，只给该玩家发 game:yourTurn
  -> 前端 showActions()
  -> 玩家点击按钮
  -> Net.send('game:action', { action, amount })
  -> Room.handlePlayerAction()
  -> Game.handleAction()
  -> Game.broadcastState()
  -> 前端 renderGame()
```

### 10.5 一手牌结束

```text
所有下注轮完成或只剩一名未弃牌玩家
  -> showdown() 或 endHand()
  -> 计算 winners
  -> 更新 stack
  -> game:showdown / game:handEnd
  -> Room.onGameEnd()
  -> 同步房间玩家筹码
  -> 记录统计和成就
  -> 15 秒后自动开始下一手
```

### 10.6 断线和重连

断线：

```text
ws close
  -> playerSockets.delete(playerId)
  -> currentRoom.removePlayer(playerId)
  -> 如果游戏中，Game.handleDisconnect()
  -> 如果轮到该玩家，自动 fold
```

重连：

```text
客户端重新连接
  -> auth 使用旧 playerId
  -> joinRoom()
  -> 如果 room.players.has(playerId)
  -> Room.handleReconnect()
  -> Game.handleReconnect()
  -> 发送当前 game:state 和可能的 game:yourTurn
```

## 11. 如何修 bug

### 11.1 先判断 bug 属于哪一层

UI 显示错误：

```text
public/index.html
  -> renderGame()
  -> Net.on(...)
  -> CSS
```

按钮点了没反应：

```text
public/index.html addEventListener
  -> Net.send()
  -> server/index.js switch case
```

服务端返回错误：

```text
server/index.js
  -> RoomRegistry / Room
  -> Game
```

游戏规则错误：

```text
server/game.js
  -> handleAction()
  -> advancePhase()
  -> showdown()
  -> evaluateHand()
```

房主、重连、观战、房间列表错误：

```text
server/room.js
```

登录、签到、排行榜、成就错误：

```text
server/userStore.js
server/index.js user:* cases
public/index.html user UI
```

语音聊天错误：

```text
public/index.html WebRTC section
server/room.js routeVoiceSignal()
server/index.js voice:* cases
```

### 11.2 推荐排查路径

1. 先看浏览器控制台有没有前端异常。
2. 看 WebSocket 是否发出了预期 `type`。
3. 在 `server/index.js` 找对应 `case`。
4. 看该 `case` 调用了 `Room`、`Game` 还是 `UserStore`。
5. 如果是游戏 bug，优先写或改 `test/simulate-game.js` 风格的直接引擎测试。
6. 如果是多人同步 bug，优先参考 `tests/test-room.js` 或 `tests/test-turn.js`。
7. 如果是 UI bug，参考 `tests/test-browser.js` 或手动多浏览器窗口验证。

### 11.3 常见 bug 类型

只给当前玩家发行动面板：

```text
看 game:yourTurn 是否只发给一个 ws
相关测试：tests/test-turn.js
```

房主离开后新房主按钮不显示：

```text
看 room:hostChanged 和 room:players 是否包含正确 hostId
相关测试：tests/test-bugs-unit.js
```

断线后房间消失太快：

```text
看 Room.removePlayer() 和 destroyTimer
相关测试：tests/test-room.js
```

别人能看到我的手牌：

```text
严查 getStateForPlayer() / getStateForSpectator()
不要广播原始 getState()
```

All-in 结算错误：

```text
看 Game.showdown() 的 side pot calculation
建议构造固定玩家 totalBet 的单元测试
```

## 12. 如何新增功能

### 12.1 新增一个房间功能

例：增加“踢出玩家”。

推荐步骤：

1. 前端按钮点击发送 `Net.send('room:kick', { targetId })`。
2. `server/index.js` 新增 `case 'room:kick'`。
3. 校验 `currentRoom` 存在。
4. 校验 `playerId === currentRoom.hostId`。
5. 在 `Room` 中新增 `kickPlayer(hostId, targetId)`。
6. 广播 `room:playerKicked` 和最新 `room:players`。
7. 前端 `Net.on('room:playerKicked')` 更新 UI 或提示。
8. 写 WebSocket 测试覆盖房主可踢、非房主不可踢、被踢玩家收到事件。

### 12.2 新增一个游戏规则

例：增加重买入 `rebuy`。

推荐步骤：

1. 明确规则：什么时候可买、买多少、是否影响排行榜。
2. 前端新增按钮，发送 `game:rebuy` 或 `room:rebuy`。
3. `server/index.js` 加协议入口。
4. 如果只影响房间筹码，放 `Room`。
5. 如果影响牌局中玩家状态，放 `Game`。
6. 更新 `game:state`，让前端可以渲染新筹码。
7. 添加测试：筹码不足、游戏中、观战者、Bot 等边界。

### 12.3 新增一个用户功能

例：增加改昵称。

推荐步骤：

1. `userStore.js` 新增 `updateName()` 或类似方法。
2. `server/index.js` 新增 `user:updateName`。
3. 更新当前连接的 `ws.playerName`。
4. 如果玩家在房间里，同步 `Room.players` 中的 name。
5. 广播 `room:players`，让房间 UI 更新。
6. 前端加输入框和 `Net.on('user:nameUpdated')`。
7. 测试重名、长度、登录态、房间内同步。

### 12.4 新增前端 UI

由于前端是单文件，建议：

1. 先搜索是否已有类似弹窗/按钮/列表。
2. 复用现有 class 和布局风格。
3. HTML 结构放到对应 screen/modal 区域。
4. CSS 放到 `<style>` 中相关模块附近。
5. JS 事件放到底部按钮 handlers 附近。
6. 服务端消息响应放到 `Net.on(...)` 附近。

## 13. 测试策略

### 13.1 当前测试脚本

需要先启动服务：

```bash
npm start
```

然后另开终端运行：

```bash
node tests/test-room.js
node tests/test-turn.js
node tests/test-voice.js
node tests/test-bugs-unit.js
node test/simulate-game.js
```

### 13.2 不同改动对应测试

房间、断线、重连：

```bash
node tests/test-room.js
```

行动轮转、当前玩家行动面板：

```bash
node tests/test-turn.js
```

语音信令：

```bash
node tests/test-voice.js
```

已知 bug 回归：

```bash
node tests/test-bugs-unit.js
```

游戏引擎流程：

```bash
node test/simulate-game.js
```

### 13.3 建议补充的测试

当前 `package.json` 没有 `npm test`，建议后续增加：

```json
{
  "scripts": {
    "test": "node tests/test-room.js && node tests/test-turn.js && node tests/test-voice.js && node tests/test-bugs-unit.js"
  }
}
```

更理想的方向：

- 为 `server/game.js` 增加纯单元测试，不依赖 WebSocket。
- 为边池、All-in、牌型评估增加固定输入测试。
- 为 `userStore.js` 使用临时 data 文件测试，避免污染真实数据。
- 为前端核心流程引入 Playwright 并明确依赖。

## 14. 数据和持久化

### 用户数据

```text
data/users.json
```

由 `UserStore` 写入，包含用户资料、密码 hash、筹码、签到、统计、成就。

### 牌局日志

```text
data/game-hands.jsonl
```

由 `gameLogger` 写入，每行是一手牌 JSON。

### 房间数据

房间数据只在内存中：

```text
RoomRegistry.rooms
RoomRegistry.playerRoom
```

服务重启后房间全部丢失。

### 排行榜

优先来自 `UserStore` 中注册用户统计。如果没有注册用户数据，会使用 `StatsTracker` 的内存统计。

## 15. 常见风险点

### 15.1 不要把完整游戏状态广播给所有人

`Game.getState()` 包含真实手牌。正常广播必须使用：

```js
getStateForPlayer(playerId)
getStateForSpectator()
```

### 15.2 `currentRoom` 是连接级变量

`server/index.js` 中的 `currentRoom` 只属于当前 WebSocket 连接。断线重连后要通过房间号和 `playerId` 找回状态，不能假设旧连接变量还存在。

### 15.3 房间玩家和游戏玩家不是同一个对象

`Room.players` 里有房间玩家状态，`Game.players` 里有牌局玩家状态。游戏结束时 `Room.onGameEnd()` 会把 `Game.players` 的 stack 同步回 `Room.players`。

改筹码逻辑时要注意两个层级都可能需要同步。

### 15.4 观战者不能操作

`Room.handlePlayerAction()` 中已经拦截 spectators。新增任何游戏操作时也要考虑观战者权限。

### 15.5 Bot 使用假 WebSocket

Bot 的 `ws` 是 `BotSocket`，只有 `readyState` 和空 `send()`。新增逻辑时不要假设所有玩家都有真实浏览器连接。

### 15.6 用户数据是同步文件写入

`userStore.js` 使用 `fs.writeFileSync`。小规模没问题，高并发或生产环境需要改数据库或异步队列。

### 15.7 中文乱码问题

源码和 README 中存在明显乱码显示。修改中文文案时建议：

- 确认编辑器使用 UTF-8。
- 不要在不确认含义时批量替换乱码文本。
- 可以逐步把用户可见文案重新整理为正常中文。

## 16. 推荐开发路线

### 第一天熟悉项目

1. 跑起来：`npm install`、`npm start`。
2. 打开两个浏览器窗口，手动创建房间、加入房间、开始游戏。
3. 读 `server/index.js`，理解所有消息入口。
4. 读 `server/room.js`，理解房间生命周期。
5. 读 `server/game.js`，理解牌局状态机。
6. 搜 `public/index.html` 的 `Net.on(`，理解前端响应。

### 第一次修 bug

1. 先确认 bug 属于 UI、协议、房间、游戏、用户哪一层。
2. 找最接近的测试脚本。
3. 先复现，再修改。
4. 如果没有测试，补一个最小 WebSocket 或 Game 单元测试。
5. 跑相关测试。
6. 多浏览器手动验证一次多人同步。

### 第一次加功能

1. 写清楚客户端需要发什么消息。
2. 写清楚服务端需要广播什么事件。
3. 明确状态属于 `Room`、`Game` 还是 `UserStore`。
4. 先做服务端协议和状态变更。
5. 再接前端 UI。
6. 最后补测试。

## 17. 文件级修改指南

### 改 `server/index.js`

适合：

- 新协议
- 权限校验入口
- 用户/房间/游戏消息分发
- WebSocket 连接生命周期

小心：

- 不要在这里塞太多业务细节，复杂逻辑应下沉到 `Room`、`Game` 或 `UserStore`。

### 改 `server/room.js`

适合：

- 房间规则
- 房主逻辑
- 观战逻辑
- Bot 加入
- 房间广播
- 断线重连

小心：

- 修改 `removePlayer()` 时要检查房主转移、游戏中断线、空房间宽限。

### 改 `server/game.js`

适合：

- 德州扑克规则
- 下注行为
- 阶段推进
- 结算
- Bot 策略
- 手牌可见性

小心：

- 游戏状态机很容易出现边界问题，尤其是 all-in、多人边池、断线、只剩一人、Bot 自动行动。

### 改 `server/userStore.js`

适合：

- 用户资料
- 登录注册
- 签到
- 成就
- 排行榜

小心：

- 会写真实 `data/users.json`，测试时最好用临时数据文件或 mock。

### 改 `public/index.html`

适合：

- 页面结构
- 样式
- 前端状态
- 按钮事件
- WebSocket 事件处理
- 音效/语音/UI 动画

小心：

- 文件很长，建议小步修改并频繁刷新验证。
- 改服务端事件名时，前后端必须一起改。

## 18. 后续重构建议

这些不是必须马上做，但会明显提升可维护性：

- 把 `public/index.html` 拆成 `index.html`、`style.css`、`client.js`。
- 把前端 JS 再拆成 `net.js`、`lobby.js`、`table.js`、`voice.js`、`user.js`。
- 给 `server/game.js` 增加独立单元测试。
- 把消息协议整理成一份 `PROTOCOL.md`。
- 给 `package.json` 增加 `test` 脚本。
- 用数据库替代 JSON 文件用户存储。
- 用 Redis 或数据库保存房间状态，支持多实例部署。
- 修复 README 和源码用户可见中文乱码。

## 19. 快速索引

```text
我要改启动端口        -> server/index.js PORT
我要改房间号规则      -> server/room.js RoomRegistry.generateCode()
我要改最大人数        -> server/room.js Room constructor maxPlayers
我要改起始筹码        -> server/game.js START_STACK 或 room options
我要改盲注            -> server/game.js SB/BB 或 room options
我要改牌型判断        -> server/game.js evaluateHand()/evaluate5()
我要改下注规则        -> server/game.js handleAction()
我要改下一阶段逻辑    -> server/game.js advancePhase()
我要改结算            -> server/game.js showdown()/endHand()
我要改 Bot            -> server/game.js botDecide()
我要改观战            -> server/room.js addSpectator()/sendSpectatorState()
我要改排行榜          -> server/userStore.js getLeaderboard()
我要改成就            -> server/userStore.js ACHIEVEMENTS/_checkAchievements()
我要改登录            -> server/userStore.js + server/index.js user cases
我要改前端牌桌        -> public/index.html renderGame()
我要改行动按钮        -> public/index.html showActions() + button handlers
我要新增协议          -> public Net.send + server/index.js switch + public Net.on
```
