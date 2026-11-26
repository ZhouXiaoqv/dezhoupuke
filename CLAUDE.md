# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                  # Start server on port 3000 (configurable via PORT env var)
npm run dev                # Start with --watch for auto-restart on file changes
npm test                  # Rules, isolated WebSocket tests, and Chrome display regressions
npm run test:unit         # Direct engine/store tests
npm run test:network      # WebSocket integration tests
npm run test:browser      # Automated display regressions
npm run test:screenshots  # Optional multiplayer screenshot walkthroughs
```

`tests/run.js` registers the suites used by npm. It starts the test server on a random loopback port and sets `POKER_DATA_DIR` for accounts, catalog, and logs. Browser suites require installed Chrome or a Chromium executable selected with `POKER_BROWSER`.

## Architecture

Server-authoritative Texas Hold'em poker game. All game logic runs on the server; the client only renders and sends actions.

### Server (`server/`)

Entry point is `server/index.js` — it wires together modules and starts the WebSocket server. Message routing uses a per-connection `ws._on(type, handler)` pattern registered by handler modules in `server/handlers/`.

Handler modules receive a shared context: `{ userStore, registry, wsManager, stats, playerSockets, wireStatsReporting }`. Auth handler exposes helper methods on the ws object (`ws._requireLogin`, `ws._bindIdentity`, `ws._finalizeSession`) used by other handlers.

Key classes:
- `RoomRegistry` (`server/room.js`) — manages room lifecycle, player join/leave, game start
- `Game` (`server/game.js`) — poker engine with phases, betting, side pots, showdown
- `UserStore` (`server/userStore.js`) — JSON file-based user persistence with token auth
- `WebSocketManager` (`server/ws.js`) — heartbeat, disconnect scheduling (15min grace)
- `StatsTracker` (`server/stats.js`) — in-memory player statistics

### Frontend (`public/`)

Pure HTML/CSS/JS — no frameworks, no build tools. `index.html` loads CSS and JS files via `<link>` and `<script>` tags. Script load order matters: net → ui → sfx → emotionFx → emotionRigs → lobby → extras → tableEffects → mechanical-arm-rig → mechanical-arm-presets → mechanical-arm-actions → mechanical-reels → mechanical-payout → mechanical-table → game → actions → handlers → controls → app.

Key modules:
- `net.js` — `Net` object: WebSocket connection, event emitter (`on/off/once/emit/send`), auto-reconnect
- `ui.js` — global state (`authToken`, `userProfile`, `isRegistered`), helper functions (`$()`, `showScreen()`, `toast()`)
- `handlers.js` — all `Net.on(...)` event handlers for room/game/user messages
- `controls.js` — button click handlers, turn timer, settlement overlay, keyboard shortcuts
- `app.js` — auto-connect, auth session management, visibility change reconnect
- `game.js` — `renderGame()` main rendering function, action log, scoreboard
- `actions.js` — `showActions()`/`hideActions()` for the action panel
- `emotionFx.js` — `EmotionFx` canvas layer: one rAF loop draws every in-room emotion (wind-up, flight, impact on the target nameplate); `emotionRigs.js` registers each emotion's animation

### WebSocket Protocol

All messages are JSON: `{ type: string, data: object }`. Client sends actions (e.g. `game:action`, `room:create`), server broadcasts state updates (e.g. `game:state`, `room:players`). The `game:state` message is filtered per-player to hide others' hands.

### Data Persistence

User data stored in `data/users.json`, including account profile, stats, achievements, coins, daily check-in state, owned card backs, and equipped card back. Game logs in `data/*.jsonl`. The `data/` directory is gitignored.

## Conventions

- Seated players open the card-back and pet selector from the shirt icon beside the sound toggle. Equipment uses the same messages as the lobby.
- Room hosts can send `room:addBot` between hands. Bots occupy normal seats, check or call through the server engine, and have no account or socket. The solo-room browser regression checks two consecutive hands.
- Server sends Chinese-language error messages to clients
- The layout test room includes local-only raise and all-in preview buttons using the live feedback renderer.
- Live action logs drive tableEffects.js and sound cues. Ordinary raises use raiseBy >= 500. All-in actions take precedence regardless of amount.
- Voluntarily revealed winners expose `revealedRank` only after opting in. Preflop reveals use the standard 一对 or 高牌 label. Showdown winners use their evaluated hand name for the seat badge.
- Seat chip counters render the server-provided per-street player bet. The layout test room shows all eight counters.
- The default ivory scene uses a horizontal rounded rectangle in both phone orientations. Table scenes are registered in `public/js/extras.js`.
- Room style is set by `room:create { tableStyle }` and sent in room and filtered game snapshots. Keep classic as the default. Mechanical rooms use server-side chip inventories from `server/chips.js`. Filtered snapshots expose only the physical chips already committed, as `betChips` per street and `potChips` for the whole hand, in `[100, 50, 20, 10, 5, 1]` order. Keep each player's remaining chip counts private and carry them across hands in `Room`. Mechanical rooms disable in-room emotions, pets, and card back customization.
- `mechanical-table.js` queues deal, reveal, fold, and settlement receipt tasks with table-relative targets and lifecycle callbacks. Keep joint geometry, SVG rendering, and the two projected shadow layers in `mechanical-arm-rig.js`, phase scheduling and payload handoff in `mechanical-arm-actions.js`, and timings and hardware cues in `mechanical-arm-presets.js`. The gift example is available for controller tests and is outside the poker action registry.
- The rig renders three fixed-geometry coaxial sleeves with bounded translation. The forearm, wrist and truss brace have fixed lengths. Docking and extraction align the servos for movement along the port axis. Every hole card and community card uses the same payload node from masked feed through edge grip and release.
- Fold jobs handle one card at a time. The recycler runs its own 360 ms cycle, and a carried card waits outside the intake until it is free. The animation queue and outstanding deliveries survive a hand change. Old deliveries retain their last table position, and pending deliveries in the current hand can attach to replacement card elements. Custom payloads can set `source`, `payloadOffset`, `payloadAngle` and `wristAngle` in the task.
- Settlement jobs join the FIFO when `game:handEnd` arrives and are ready after the same hand's payout animation. The printer has its own outlet mask and lamp, and reuses the arm's staging, edge grip and extraction phases. The same paper node moves from the printer to the arm and then to the centered receipt, which remains dismissible while the server controls the next hand. Paper amounts are net of each player's committed bets, including any awarded chips and refunds.
- The mechanical console shows the hand number, game phase, and blinds from the filtered snapshot. Its hand window reuses the balance reels with three fixed positions. The phase window folds the outgoing upper flap and then drops the incoming lower flap in two 110 ms stages.
- Mechanical seats keep the reel nodes mounted inside the nameplate. Each visual slot assigns a table edge that anchors both the inward clamp and the hand. Dealer and blind buttons and the local hand hint are embedded in the new seat housing.
- The mechanical action desk reserves its height for the entire table session. `actions.js` locks its fieldsets outside a betting turn and uses the server's raise bounds for sizing presets. The preset buttons select an amount, and the primary keys use the existing poker action handlers.
- The motion driver plans a single elbow branch, prefers a right-angle bend, and applies hard 25–155 degree limits. When the queue empties, the folded arm remains inside the rounded rectangular base. The upper sleeve lies at 22.5 degrees and casts a local shadow over the forearm at their 40-degree overlap. The wrist and jaws sit in the two parts of the inset cradle.
- Mechanical payouts peel every rendered chip from the existing pot piles, outside in and top down, and speed up their launch cadence as the stream progresses. Winner and refund `chips` route matching denominations to each account. Each impact advances the persistent balance reels, and the final impact starts the mechanical lock. A payout's remaining flights can overlap the next hand, which owns its own balance updates. The final balance always comes from the game snapshot.
- CSS is split by functional domain (base, lobby, table, action, components, responsive, extras)
- JS globals are shared across modules via `window` scope (no bundler)
- The `attemptReconnect` function is defined in `app.js` (token-based session restore), not in `handlers.js`
- `AGENTS.md` is a symlink to `CLAUDE.md` — keep them identical
- After any code change, check and sync relevant content in `CLAUDE.md` and `README.md` (project structure, protocol tables, commands, etc.)
- After adding a new test file, register it in the corresponding suite in `tests/run.js`

## Emotion Notes

- Definitions live in `server/emotionCatalog.js`. `CatalogStore` stores admin overrides (`cost`, `charmDelta`, `order`, `enabled`) and exposes merged `emotions` in public and admin catalogs; `admin:updateEmotion` edits them. Disabled emotions cannot be sent but stay in inventory.
- `room:interact` is rate limited per connection (burst 8, refill 4/s) and broadcasts only `{ fromId, toId, emotion, targetCharm }`. It must not trigger `broadcastState` or `broadcastPlayerList`. Bots can be targeted: the sender still pays, no charm changes, and `targetCharm` is `null`.
- Every accepted emotion plays in full; do not merge or drop rapid repeats. Each effect gets its own landing offset, arc, and spin.
- Animations are rigs in `public/js/emotionRigs.js` built from SVG parts in `public/assets/emotions/<id>/`; each folder also has the panel `icon.svg`.
- `UserStore._save()` coalesces writes to one async write per second; `flush()` runs on process exit. Tests that read `users.json` directly call `flush()` first.

## Pet Customization Notes

- Frontend module `public/js/pets3d.js` is an ES module Three.js overlay for equipped seat pets. It loads local Three.js from `/vendor/three/...`, GLB models from `public/assets/pets/models/`, and previews from `public/assets/pets/previews/`.
- The bottom-center pet hangs on the left and the middle-right pet sits above its nameplate to keep both clear of wagers.
- Pet synchronization discards obsolete model loads and stops drawing when the table is closed. Community card nodes are retained across profile and gift updates.
- User profiles include `ownedPets` and `equippedPet`; public profiles and game players expose `pet`.
- `user:setPet { id }` equips an owned pet or unequips with an empty id.
- `shop:buyBlindBox` supports `pet-blindbox`; pet results return `rewardType: "pet"` and `petId`, add the pet to inventory, and do not auto-equip.

## Card Back Customization Notes

- Image card backs use `type: "image"` plus a public `imageUrl`; the shared renderer applies them through `decorateCardBack()`.
- The fifteen One Piece backs in `public/assets/cardbacks/onepiece/` and nine pastel kawaii backs in `public/assets/cardbacks/cute/` are 700x1000 WebP assets registered in both server and client catalogs.
- These 24 premium backs are excluded from direct-sale `shopItems` and the standard card-back blind box. They are split into `onepiece-cardback-blindbox` (15 One Piece backs) and `cute-cardback-blindbox` (9 fruit/animal backs), each costing 1000 coins and drawing only unowned entries from its fixed `cardBackIds` pool.
- Admins can create a `cardBackPool` blind box through `admin:createBlindBox`, edit its name, price, category, order, enabled state, selected card-back pool, and `coverCardBackId` through `admin:updateBlindBox`, then publish it by setting `enabled: true`. The cover must be one of the box's `cardBackIds`.
- The public catalog exposes each blind box's `cardBackIds` so the client can preview the complete pool and ownership progress. Existing `premium-cardback-blindbox` data is migrated to the two themed boxes at startup.
- Every enabled `shopItems` card back is automatically eligible for the standard card-back blind box.
