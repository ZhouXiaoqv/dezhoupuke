# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                  # Start server on port 3000 (configurable via PORT env var)
npm run dev                # Start with --watch for auto-restart on file changes
npm test                   # Run all tests (server must be running for some)
```

WebSocket-based tests (`test-room.js`, `test-bugs-unit.js`, `test-turn.js`) require a running server. Unit tests that directly import `server/game.js` (`test-sidepot-refund.js`, `test-all-scenarios.js`) do not.

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

Pure HTML/CSS/JS — no frameworks, no build tools. `index.html` loads CSS and JS files via `<link>` and `<script>` tags. Script load order matters: net → ui → sfx → lobby → extras → game → actions → handlers → controls → app.

Key modules:
- `net.js` — `Net` object: WebSocket connection, event emitter (`on/off/once/emit/send`), auto-reconnect
- `ui.js` — global state (`authToken`, `userProfile`, `isRegistered`), helper functions (`$()`, `showScreen()`, `toast()`)
- `handlers.js` — all `Net.on(...)` event handlers for room/game/user messages
- `controls.js` — button click handlers, turn timer, settlement overlay, keyboard shortcuts
- `app.js` — auto-connect, auth session management, visibility change reconnect
- `game.js` — `renderGame()` main rendering function, action log, scoreboard
- `actions.js` — `showActions()`/`hideActions()` for the action panel

### WebSocket Protocol

All messages are JSON: `{ type: string, data: object }`. Client sends actions (e.g. `game:action`, `room:create`), server broadcasts state updates (e.g. `game:state`, `room:players`). The `game:state` message is filtered per-player to hide others' hands.

### Data Persistence

User data stored in `data/users.json`. Game logs in `data/*.jsonl`. The `data/` directory is gitignored.

## Conventions

- Server sends Chinese-language error messages to clients
- CSS is split by functional domain (base, lobby, table, action, components, responsive, extras)
- JS globals are shared across modules via `window` scope (no bundler)
- The `attemptReconnect` function is defined in `app.js` (token-based session restore), not in `handlers.js`
- `AGENTS.md` is a symlink to `CLAUDE.md` — keep them identical
- After any code change, check and sync relevant content in `CLAUDE.md` and `README.md` (project structure, protocol tables, commands, etc.)
- After adding a new test file, add it to the `test` script in `package.json`
