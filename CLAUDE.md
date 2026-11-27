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

Pure HTML/CSS/JS — no frameworks, no build tools. `index.html` loads CSS and JS files via `<link>` and `<script>` tags. Script load order matters: net → ui → mobile-table → sfx → emotionFx → emotionRigs → lobby → extras → tableEffects → mechanical-arm-rig → mechanical-arm-presets → mechanical-arm-actions → mechanical-reels → mechanical-payout → mechanical-notice → mechanical-table → table-drawers → game → actions → handlers → controls → app.

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

- Avatars are either one of fifteen vector ids (`public/assets/avatars/<id>.svg`) or one of the 18 classic emoji. Both lists live in `server/avatars.js` and `public/js/ui.js`; `user:setAvatar` accepts only those values. Render avatars with `renderAvatar(el, value)`. Unset or legacy `"A"` avatars resolve to a stable default from the first nine vector ids, and bots use `crt-mech`.
- Seated players open the equipment selector from the outfit button in the table console. Classic rooms offer card backs and pets. The mechanical console opens the card-back selector only. Equipment uses the same messages as the lobby.
- Room hosts can send `room:addBot` between hands. Bots occupy normal seats, check or call through the server engine, and have no account or socket. The solo-room browser regression checks two consecutive hands.
- Server sends Chinese-language error messages to clients
- The layout test room includes local-only raise and all-in preview buttons using the live feedback renderer.
- Live action logs drive tableEffects.js and sound cues. Ordinary raises use raiseBy >= 500. All-in actions take precedence regardless of amount.
- Voluntarily revealed winners expose `revealedRank` only after opting in. Preflop reveals use the standard 一对 or 高牌 label. Showdown winners use their evaluated hand name for the seat badge.
- Seat chip counters render the server-provided per-street player bet. The layout test room shows all eight counters.
- The creation screen advertises the mechanical room's nine-seat default. The waiting room displays occupancy using `room:players.maxPlayers`.
- The default ivory scene uses a horizontal rounded rectangle in both phone orientations. Table scenes are registered in `public/js/extras.js`.
- Room style is set by `room:create { tableStyle }` and sent in room and filtered game snapshots. Keep classic as the default. Mechanical rooms use server-side chip inventories from `server/chips.js`. Filtered snapshots expose only the physical chips already committed, as `betChips` per street and `potChips` for the whole hand, in `[100, 50, 20, 10, 5, 1]` order. Keep each player's remaining chip counts private and carry them across hands in `Room`. Mechanical rooms disable in-room emotions and pets.
- `mechanical-table.js` queues deal, reveal, fold, and settlement receipt tasks with table-relative targets and lifecycle callbacks. Keep joint geometry, SVG rendering, and the two projected shadow layers in `mechanical-arm-rig.js`, phase scheduling and payload handoff in `mechanical-arm-actions.js`, and timings and hardware cues in `mechanical-arm-presets.js`. The gift example is available for controller tests and is outside the poker action registry.
- The rig renders three rigid sleeves and a telescoping hydraulic piston from the solved shoulder-to-elbow distance. The full-range shoulder carriage and screw follow the same rail coordinate. The forearm uses coupled eccentric pins and a telescoping cross brace. The wrist's two rods and the grip anchor follow the independent 0–32 px extension. Card payloads match the local hand and community cards, sharing the same centered suit placement during delivery and after landing. The gripper rolls those visible faces up while they are still mounted. Opponent cards are delivered face down and scale down after release at the actual target. Each hole card resolves its recipient's equipped back before emerging from the bay. Community cards use the viewer's equipped back, with the existing default for spectators. In-flight cards keep the same back through placement, and queued cards can use a newer equipment snapshot before feeding.
- Fold jobs restore a picked-up opponent card to full size in transit. The arm waits in front of the recycler if busy, then uses the wrist stroke to insert 60% of the card before release. Both card-port masks and docking coordinates use the center of the drawn dark seams. Cards pass above the lower lips and below the upper deal cover and arm. The recycler advances the card under the same mask at full size during its 360 ms cycle. The animation queue and outstanding deliveries survive a hand change. Pending deliveries can attach to replacement card elements, while old ones retain their last target.
- Settlement jobs join the FIFO when `game:handEnd` arrives and are ready after the same hand's payout animation. The printer reuses the arm's staging, edge grip and extraction phases and measures its outlet at the lower edge of the drawn slit. The same paper node moves into the centered display. Its footer lets the host start the next hand once the paper settles. Connected seats acknowledge this point with `game:receiptReady`, then the room starts a shared 20-second clock with a fallback for missing acknowledgements. `game:receipt` restores the public receipt and its remaining time. The next hand dismisses the paper. Amounts are net of committed bets, including awards and refunds.
- Mechanical receipt footers let folded players and winners by fold reveal their own cards. `game:handEnd.showHandPlayerIds` identifies eligible players. `game:receiptShowHand` is scoped to the current receipt ID and obtains cards from the authenticated seat on the server. Store accepted reveals in the public receipt for reconnects and broadcast `game:handShown` to update the printed row. The next-hand clock runs independently. The classic winner's separate show choice still uses `game:showHand`.
- The mechanical console shows the hand number, game phase, and blinds from the filtered snapshot. Its hand window reuses the balance reels with three fixed positions. The phase window folds the outgoing upper flap and then drops the incoming lower flap in two 110 ms stages.
- During an active mechanical table, `toast()` routes to the cabinet's lift plate. Keep its slot clipped at the roofline and behind the SVG shell. `mechanical-notice.js` swaps text on the downward stroke and restarts the dwell on the same plate. Reset it with the table when leaving a room or switching styles.
- Mechanical rooms support nine players and keep nine seat and reel nodes mounted across snapshots. The centered dealer cabinet sits between the mirrored top stations, with two stations per side and three along the bottom. The local player stays at bottom center, while remaining players follow clockwise order, retaining their stations where possible. Each seat uses a shared, recessed 15 px strip beneath the avatar for its three independently lit role indicators. Empty seats keep their reels and role strip unlit. Live wagers use separate offsets beside the inward-facing hands, and the top stations place their wagers outward. The wager and pot canvas draws full soft shadows and irregular piles above both stationary and moving cards, beneath the arm. Its padded surface extends beyond the felt so tall piles and soft shadows can cross the rail while retaining table-local coordinates. Player wagers are painted back to front by position on the felt. The pot is painted above the wagers and below the arm. Confirmed wager increases match existing chips by denomination and launch only the newly committed chips from the seat tongue. The visual pot sweep waits for outgoing wagers to land independently of server street changes.
- Mechanical tables fit a fixed 1432 × 832 stage uniformly inside the viewport. The action desk shares the cruise box baseline wherever both fit side by side. On narrow viewports that would overlap the cruise box, the stage sits above it. The felt, desk, receipt and animated payloads share that coordinate system. Convert browser rectangles back to stage units with stageBox before using them in the rig or canvases. The full-screen backdrop and corner controls remain in viewport units. On phones, the stage fits the dynamic viewport and safe areas. In landscape it can shift within spare width to clear the cruise box without reducing the height-limited scale.
- On mobile, `mobile-table.js` requests fullscreen directly from an entry click or the console key and requests a landscape lock after fullscreen succeeds. The portrait guide depends on viewport orientation and keeps the stage and cruise box inert. The mechanical raise range captures the primary touch pointer, maps it through the actual scaled range rectangle and uses the same detents as mouse and keyboard.
- The viewport console groups mute, operation log and scoreboard, plus a mobile-only fullscreen key. TableDrawers serializes the two panels through the same clipped rail opening. Score rows use the server totals and the currently seated player identities.
- The mechanical action desk reserves its height for the entire table session. `actions.js` locks its fieldsets outside a betting turn. The raise track detents are spaced five chips apart from the server minimum, with the exact all-in amount at its right stop. The sizing presets and track update a read-only reel bank. The call key shares the reel renderer and returns to four zeroes on a check. The primary keys use the existing poker action handlers. The viewport cruise control shares the stored auto-call limit between its reels and the action logic. The adjustment keys step by the big blind and zero continues to allow automatic checks only. Its lamp pulses on the matching server action log entry.
- Mechanical turn deadlines are owned by `Game` and default to 20 seconds. State includes the current player, duration, remaining time, and deadline. The browser drains a 3.75 px rounded-square light clockwise over a recessed charcoal track. A highlight follows the moving boundary. In the final five seconds the amber-red light and seat lamp pulse together, with a steady warning color under reduced motion. The client locks locally at zero. Only the server chooses and records a timeout check or fold. Timeout folds enter the normal fold animation through the state snapshot.
- The mechanical game gates betting and all-in runouts on each hole-card or community-card batch. `game:state.cardGate` carries a unique batch ID and the first new board index, with `null` for hole cards. Connected human seats send `game:cardsReady` after the last payload lands. Disconnects and a bounded server deadline release missing confirmations. Hidden or reduced-motion clients place the whole batch immediately, and clients finish any outstanding batch visually before rendering a server transition. Same-street folds open the next turn independently of the recycler. All arm jobs still use the same FIFO.
- The riveted center meter shows the authoritative pot above the common cards, with its lower edge anchored to the board station. Collected chips are drawn directly on the felt between the printer and the board, spreading to both sides as the pot grows. The board is anchored from the bottom rail so the additional 64 px of felt increases the pot band without tightening the gap to the local hand. Wagers and pot piles render the full counts from the snapshot. The board keeps invisible 3+1+1 landing targets and highlights the winning public cards on the cards themselves. The strength tower sits to the left of the outer seats inside the scaled stage and uses only the viewer's landed hole cards and public cards. Its three 24 px windows reuse the phase display's split-flap motion and render one aligned glyph per window at rest. The glass column lights up to nine segments and adds a gold sweep and dome pulse for a royal flush. `sfx.js` generates the mechanical impacts and detents locally and routes them through the existing mute control.
- The motion driver plans a single elbow branch, prefers a right-angle bend, and applies hard 25–155 degree limits. When its queue empties, the arm parks at 140 px of upper arm length. The upper sleeve lies at 22.5 degrees and casts a local shadow over the forearm at their 45-degree overlap. The wrist and jaws sit in the inset cradle.
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
