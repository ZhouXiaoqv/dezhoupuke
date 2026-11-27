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

  ws._on('game:cardsReady', (data) => {
    if (isPlayer()) ws._currentRoom?.handleCardsReady(ws._playerId, data?.id);
  });

  ws._on('game:showHand', (data) => {
    if (!isPlayer()) return;
    if (!ws._currentRoom) return;
    ws._currentRoom.handleShowHandChoice(ws._playerId, !!data?.show);
  });

  ws._on('game:receiptReady', (data) => {
    if (isPlayer()) ws._currentRoom?.handleReceiptReady(ws._playerId, data?.receiptId);
  });

  ws._on('game:receiptShowHand', (data) => {
    if (isPlayer() && !ws.isSpectator) ws._currentRoom?.handleReceiptShowHand(ws._playerId, data?.receiptId);
  });

  ws._on('game:nextHand', (data) => {
    if (isPlayer()) ws._currentRoom?.handleNextHand(ws._playerId, data?.receiptId);
  });
}

module.exports = { register };
