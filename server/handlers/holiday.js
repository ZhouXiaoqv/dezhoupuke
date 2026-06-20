function send(ws, type, data) {
  ws.send(JSON.stringify({ type, data }));
}

function requirePlayer(ws, userStore) {
  if (!ws._requireLogin()) return false;
  if (!userStore.isPlayer(ws._currentUser.username)) {
    send(ws, 'holiday:error', { message: '管理员不能领取玩家礼物' });
    return false;
  }
  return true;
}

function register(ws, ctx) {
  const { userStore, catalogStore } = ctx;

  ws._on('holiday:list', () => {
    if (!requirePlayer(ws, userStore)) return;
    const profile = userStore.getProfile(ws._currentUser.username);
    send(ws, 'holiday:list', {
      gifts: catalogStore.getClaimableHolidayGifts(profile),
    });
  });

  ws._on('holiday:claim', (data) => {
    if (!requirePlayer(ws, userStore)) return;
    const gift = catalogStore.getHolidayGift(data && data.id);
    if (!gift) {
      send(ws, 'holiday:error', { message: '礼物不存在或已过期' });
      return;
    }
    const result = userStore.applyHolidayGift(ws._currentUser.username, gift);
    if (result.error) {
      send(ws, 'holiday:error', { message: result.error });
      return;
    }
    send(ws, 'holiday:claimed', {
      gift: result.gift,
      rewards: result.rewards,
      skipped: result.skipped,
      profile: result.profile,
      gifts: catalogStore.getClaimableHolidayGifts(result.profile),
    });
  });
}

module.exports = { register };
