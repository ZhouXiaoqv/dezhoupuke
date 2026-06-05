/**
 * Game Message Handlers — player actions, next hand
 */

function register(ws) {
  ws._on('game:action', (data) => {
    if (!ws._currentRoom) return;
    ws._currentRoom.handlePlayerAction(ws._playerId, data);
  });

  ws._on('game:showHand', (data) => {
    if (!ws._currentRoom) return;
    ws._currentRoom.handleShowHandChoice(ws._playerId, !!data?.show);
  });

  ws._on('game:nextHand', () => {
    if (!ws._currentRoom || ws._currentRoom.hostId !== ws._playerId) return;
    if (ws._currentRoom.nextHandTimer) {
      clearTimeout(ws._currentRoom.nextHandTimer);
      ws._currentRoom.nextHandTimer = null;
      if (ws._currentRoom.players.size >= 2) ws._currentRoom.startGame(ws._playerId);
    }
  });
}

module.exports = { register };
