/**
 * Game Message Handlers — player actions, next hand
 */

function register(ws, ctx = {}) {
  const { userStore } = ctx;

  function isPlayer() {
    return !!(
      ws._currentUser &&
      (!userStore || userStore.isPlayer(ws._currentUser.username))
    );
  }

  ws._on('game:action', (data) => {
    if (!isPlayer()) return;
    if (!ws._currentRoom) return;
    ws._currentRoom.handlePlayerAction(ws._playerId, data);
  });

  ws._on('game:showHand', (data) => {
    if (!isPlayer()) return;
    if (!ws._currentRoom) return;
    ws._currentRoom.handleShowHandChoice(ws._playerId, !!data?.show);
  });

  ws._on('game:nextHand', () => {
    if (!isPlayer()) return;
    if (!ws._currentRoom || ws._currentRoom.hostId !== ws._playerId) return;
    if (ws._currentRoom.nextHandTimer) {
      clearTimeout(ws._currentRoom.nextHandTimer);
      ws._currentRoom.nextHandTimer = null;
      if (ws._currentRoom.canStartHand()) ws._currentRoom.startGame(ws._playerId);
    }
  });
}

module.exports = { register };
