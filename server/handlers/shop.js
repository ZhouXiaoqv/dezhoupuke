function send(ws, type, data) {
  ws.send(JSON.stringify({ type, data }));
}

function requirePlayer(ws, userStore) {
  if (!ws._requireLogin()) return false;
  if (!userStore.isPlayer(ws._currentUser.username)) {
    send(ws, 'shop:error', { message: '管理员不能使用玩家商店' });
    return false;
  }
  return true;
}

function register(ws, ctx) {
  const { userStore, catalogStore } = ctx;

  ws._on('shop:getCatalog', () => {
    if (!requirePlayer(ws, userStore)) return;
    const profile = userStore.getProfile(ws._currentUser.username);
    send(ws, 'shop:catalog', {
      catalog: catalogStore.getPublicCatalog(),
      profile,
    });
  });

  ws._on('shop:buyItem', (data) => {
    if (!requirePlayer(ws, userStore)) return;
    const result = userStore.buyCardBack(ws._currentUser.username, data && (data.id || data.cardBackId));
    if (result.error) {
      send(ws, 'shop:error', { message: result.error });
      return;
    }
    send(ws, 'shop:purchaseResult', {
      id: result.id,
      price: result.price,
      profile: result.profile,
    });
  });

  ws._on('shop:buyBlindBox', (data) => {
    if (!requirePlayer(ws, userStore)) return;
    const result = userStore.buyBlindBox(ws._currentUser.username, data && data.id);
    if (result.error) {
      send(ws, 'shop:error', { message: result.error });
      return;
    }
    send(ws, 'shop:blindBoxResult', {
      id: result.blindBox.id,
      name: result.blindBox.name,
      price: result.price,
      cardBackId: result.cardBackId,
      pool: result.pool,
      profile: result.profile,
    });
  });
}

module.exports = { register };
