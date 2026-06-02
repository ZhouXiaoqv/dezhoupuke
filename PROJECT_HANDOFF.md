## 德州扑克 Online — 项目交付文档

### 项目概况

在线多人德州扑克游戏，支持 2-6 人联机 + AI 人机对战，5 种玩法模式（经典/急速/短牌/高额/All-in Fold），含 WebRTC 语音聊天、成就系统、排行榜。

### 技术架构

前端：单文件 SPA，全部 HTML/CSS/JS 内联在 `public/index.html`（约 2574 行），无构建工具，无框架，原生 JS + WebSocket。
后端：Node.js，纯 WebSocket 服务（ws 包，无 Express），进程用 PM2 管理。
文件结构：
```
/opt/poker-online/
├── public/index.html        ← 唯一前端文件
├── server/
│   ├── index.js             ← WebSocket 服务器 + 消息路由
│   ├── room.js              ← 房间管理（创建/加入/离开/状态）
│   ├── game.js              ← 游戏引擎（发牌/下注/摊牌/_bot AI 用蒙特卡洛模拟）
│   └── userStore.js         ← 用户持久化（JSON 文件，含注册/登录/统计/成就）
├── data/users.json          ← 用户数据文件
└── package.json             ← 依赖：ws@^8.18.0
```

### 服务器与部署

服务器 IP：47.106.206.100
SSH：root / gevK6sWHF_w_4Ug
免密密钥：`~/.ssh/id_ed25519_deploy`（已配好，部署时加 `-i ~/.ssh/id_ed25519_deploy`）
部署目录：`/opt/poker-online/`
重启命令：`cd /opt/poker-online && pm2 restart poker-online`
验证：`curl -s -o /dev/null -w '%{http_code}' http://localhost:3000`（应返回 200）
部署流程：scp 传文件 → SSH 执行 pm2 restart，示例：
```bash
scp -i ~/.ssh/id_ed25519_deploy public/index.html root@47.106.206.100:/opt/poker-online/public/index.html
ssh -i ~/.ssh/id_ed25519_deploy root@47.106.206.100 "cd /opt/poker-online && pm2 restart poker-online"
```
域名：用户正在阿里云注册域名（审核中），后续需配 Nginx + Let's Encrypt SSL 以实现 HTTPS（解决浏览器麦克风权限要求安全上下文的问题）。当前通过 `http://47.106.206.100:3000` 访问。

### WebSocket 协议

客户端 → 服务端：auth / user:register / user:login / user:profile / user:guest / room:create / room:join / room:leave / room:start / room:ready / room:list / room:botGame / room:spectate / game:action / stats:get / voice:join / voice:leave / voice:offer / voice:answer / voice:ice-candidate
服务端 → 客户端：auth:ok / user:registered / user:loggedIn / user:profile / user:achievement / user:error / room:created / room:joined / room:state / room:players / room:playerJoined / room:playerLeft / room:ready / room:error / room:left / room:destroyed / room:list / game:started / game:state / game:action / game:finished / game:hand-result / stats:data / voice:join / voice:leave / voice:offer / voice:answer / voice:ice-candidate

### 前端关键结构（index.html）

页面/屏幕：#lobbyScreen（首页大厅）→ #createRoomScreen（创建房间页）→ #roomScreen（等待房间）→ #table-container（游戏桌面）
JS 工具函数：`$(id)` 获取元素，`showScreen(id)` 切换屏幕，`toast(msg)` 弹提示，`showError(msg)` 显示错误
语音：VoiceChat 模块（IIFE），基于 WebRTC P2P + WebSocket 信令
音效：Web Audio API 合成（无外部音频文件）
语音播报：Web Speech API (TTS)
成就：20 个成就定义，JSON 文件持久化

---

### 待实现功能清单（16 项）

**P0 — 紧急修复**

1. **局内退出按钮**：游戏桌面（#table-container）左上角已有 `#gameExitBtn`（✕ 圆形按钮），点击发送 `room:leave`。如果用户反馈看不到，检查 CSS 是否被遮挡或 z-index 不够（当前 z-index:200）。

2. **语音引导不生效**：局内语音播报用的 Web Speech API（speechSynthesis），检查 voiceAnnounceToggle 的状态管理。可能原因：移动端浏览器需要用户交互后才能播放 TTS；HTTPS 缺失导致部分 API 不可用。

**P1 — 核心游戏体验**

3. **45 秒操作倒计时**：轮到玩家时启动 45s 倒计时，剩余 5s 时强烈视觉+声音提示，超时自动弃牌。需要改 game.js 服务端加 timer + 前端显示倒计时圆环/进度条。服务端超时发送 `game:action { action: 'fold' }`。

4. **不自动开下一手**：当前一手结束后暂停，给玩家时间。显示结算信息，房主点「下一手」或倒计时 15s 后自动开始。改 room.js 的自动开局逻辑。

5. **赢家结算画面**：一手牌结束时，赢得最多的玩家展示专属结算动画（音乐 + 舞蹈动作 + 筹码飞入效果）。前端在 game:hand-result 事件后渲染全屏 overlay。

6. **手机预设加注按钮（九宫格）**：移动端加注不用滑动条，改为预设按钮网格：50/100/200/500/1000/2000/5000/ALL-IN/自定义。检测 `window.innerWidth < 768` 时切换显示模式。

7. **手机横屏模式**：CSS 加 `@media (orientation: landscape)` 样式，横屏时牌桌横向展开，操作面板在右侧。viewport meta 去掉 `user-scalable=no` 的限制或加 landscape 适配。

**P2 — UI/交互增强**

8. **电脑/手机两套 UI**：桌面端宽屏布局（牌桌居中，信息面板两侧），移动端竖屏/横屏自适应。用 CSS `@media` + JS 检测设备类型切换 class。

9. **加注/跟注丢筹码动画**：玩家操作时，筹码从玩家头像飞向底池区域。用 CSS @keyframes + JS 动态创建元素，动画结束后移除。

10. **局内背景音乐**：Web Audio API 合成优雅皇宫风格循环音乐（或引入免费音频 URL）。加音乐开关按钮，音量可调。

11. **玩家间交互**：送花/送美女荷官/送筹码等表情互动。前端显示互动按钮面板，发送 WebSocket 消息（新增 `room:interact` 类型），接收方显示动画。

12. **局内排行榜**：游戏进行中可查看实时排行榜。前端加排行榜按钮/侧边栏，复用现有 stats:get 协议。

**P3 — 系统功能**

13. **每日签到 + 筹码经济**：每天签到送筹码（服务端 userStore.js 记录 lastCheckin 日期）。初始筹码从个人中心余额扣除，输光时自动补充。需改 userStore 加 chips/checkin 字段，前端加签到弹窗。

14. **个人角色换装 + 筹码收藏**：个人中心加角色形象系统（头饰/衣服/表情），可装备不同外观。筹码收藏柜展示稀有筹码（金龙/钻石等），通过成就或活动解锁。前端加换装 overlay + 收藏柜页面。

15. **换装角色坐在座位上**：座位上的玩家头像替换为角色的换装形象。手机端可简化为头像框+小图标。

**P4 — 大型功能**

16. **10 个赌桌场景**：澳门赌场/永利皇宫/地下赌场/拉斯维加斯/摩纳哥/大西洋城/葡京/金沙/星际/水晶宫。每个场景有不同的背景图/牌桌纹理/环境音效/装饰元素。前端用 CSS 变量 + 背景图切换实现，场景选择在创建房间时设定。

17. **占卜模块**：大厅或局内可触发占卜，展示塔罗翻牌/水晶球/转盘等动画，随机给出「幸运值」加成（纯心理效果）。前端用 CSS 3D 翻转动画。

18. **塔罗牌小游戏**：独立的塔罗牌玩法入口，玩家可单独去玩。需要独立的屏幕/游戏逻辑/牌面渲染。

### 建议实现顺序

第一批（核心体验）：3→4→5→6→7 → 部署验证
第二批（交互增强）：8→9→10→11→12 → 部署验证
第三批（系统功能）：13→14→15 → 部署验证
第四批（大型功能）：16→17→18 → 部署验证
每批完成后部署测试，确保不破坏已有功能。

### 注意事项

- 前端是单文件 ~2600 行，修改时注意不要引入重复 ID，改完后用 `grep -oP 'id="[^"]*"' file | sort | uniq -d` 检查
- 所有新屏幕需要加入 showScreen() 的管理（`.screen` class）
- WebSocket 新增消息类型需要同时改 server/index.js 的路由和前端的事件监听
- 手机端测试用 Chrome DevTools 的 Device Mode
- HTTPS 配好后语音聊天才能正常工作（getUserMedia 要求安全上下文）
