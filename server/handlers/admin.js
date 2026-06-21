function send(ws, type, data) {
  ws.send(JSON.stringify({ type, data }));
}

function requireAdmin(ws, userStore) {
  if (!ws._currentUser || !userStore.isAdmin(ws._currentUser.username)) {
    send(ws, 'admin:error', { message: '需要管理员权限' });
    return false;
  }
  return true;
}

function register(ws, ctx) {
  const { userStore, catalogStore, registry } = ctx;

  ws._on('admin:getDashboard', () => {
    if (!requireAdmin(ws, userStore)) return;
    send(ws, 'admin:dashboard', {
      users: userStore.listUsers(),
      catalog: catalogStore.getAdminCatalog(),
      scoreboardDiagnostics: registry.getScoreboardDiagnostics(),
    });
  });

  ws._on('admin:getScoreboardDiagnostics', () => {
    if (!requireAdmin(ws, userStore)) return;
    send(ws, 'admin:scoreboardDiagnostics', {
      reports: registry.getScoreboardDiagnostics(),
    });
  });

  ws._on('admin:listUsers', () => {
    if (!requireAdmin(ws, userStore)) return;
    send(ws, 'admin:users', { users: userStore.listUsers() });
  });

  ws._on('admin:disableUser', (data) => {
    if (!requireAdmin(ws, userStore)) return;
    const result = userStore.disableUser(data && data.username, ws._currentUser.username);
    if (result.error) {
      send(ws, 'admin:error', { message: result.error });
      return;
    }
    send(ws, 'admin:userDisabled', {
      user: result.user,
      users: userStore.listUsers(),
    });
  });

  ws._on('admin:getCatalog', () => {
    if (!requireAdmin(ws, userStore)) return;
    send(ws, 'admin:catalog', { catalog: catalogStore.getAdminCatalog() });
  });

  ws._on('admin:updateCategory', (data) => {
    if (!requireAdmin(ws, userStore)) return;
    const result = catalogStore.updateCategory(data || {});
    if (result.error) {
      send(ws, 'admin:error', { message: result.error });
      return;
    }
    send(ws, 'admin:catalog', { catalog: result.catalog });
  });

  ws._on('admin:updateShopItem', (data) => {
    if (!requireAdmin(ws, userStore)) return;
    const result = catalogStore.updateShopItem(data || {});
    if (result.error) {
      send(ws, 'admin:error', { message: result.error });
      return;
    }
    send(ws, 'admin:catalog', { catalog: result.catalog });
  });

  ws._on('admin:updateBlindBox', (data) => {
    if (!requireAdmin(ws, userStore)) return;
    const result = catalogStore.updateBlindBox(data || {});
    if (result.error) {
      send(ws, 'admin:error', { message: result.error });
      return;
    }
    send(ws, 'admin:catalog', { catalog: result.catalog });
  });

  ws._on('admin:createHolidayGift', (data) => {
    if (!requireAdmin(ws, userStore)) return;
    const result = catalogStore.createHolidayGift(data || {});
    if (result.error) {
      send(ws, 'admin:error', { message: result.error });
      return;
    }
    send(ws, 'admin:catalog', { catalog: result.catalog });
  });

  ws._on('admin:updateHolidayGift', (data) => {
    if (!requireAdmin(ws, userStore)) return;
    const result = catalogStore.updateHolidayGift(data || {});
    if (result.error) {
      send(ws, 'admin:error', { message: result.error });
      return;
    }
    send(ws, 'admin:catalog', { catalog: result.catalog });
  });

  ws._on('admin:disableHolidayGift', (data) => {
    if (!requireAdmin(ws, userStore)) return;
    const result = catalogStore.disableHolidayGift(data && data.id);
    if (result.error) {
      send(ws, 'admin:error', { message: result.error });
      return;
    }
    send(ws, 'admin:catalog', { catalog: result.catalog });
  });
}

module.exports = { register, requireAdmin };
