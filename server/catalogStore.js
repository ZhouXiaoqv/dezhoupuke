const fs = require('fs');
const path = require('path');
const { CARD_BACK_SHOP, DEFAULT_CARD_BACK } = require('./userStore');

const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'data', 'catalog.json');

const IMAGE_CARD_BACKS = [
  {
    id: 'dragonboat-1',
    name: '端午牌背一',
    type: 'image',
    imageUrl: 'assets/cardbacks/dragonboat-1.png',
  },
];
const REMOVED_CARD_BACK_IDS = new Set(['dragonboat-2']);

function buildDefaultCardBacks() {
  const entries = [
    { id: DEFAULT_CARD_BACK, name: '默认蓝色', type: 'css' },
    ...CARD_BACK_SHOP.map((item) => ({
      id: item.id,
      name: item.id,
      type: 'css',
    })),
    ...IMAGE_CARD_BACKS,
  ];
  return entries.map((item, index) => ({ order: index, ...item }));
}

function buildDefaultCatalog() {
  return {
    version: 1,
    shopCategories: [
      { id: 'card-backs', name: '牌背', order: 1, enabled: true },
      { id: 'blind-box', name: '盲盒', order: 2, enabled: true },
    ],
    cardBacks: buildDefaultCardBacks(),
    shopItems: CARD_BACK_SHOP.map((item, index) => ({
      id: `cardback-${item.id}`,
      type: 'cardBack',
      cardBackId: item.id,
      categoryId: 'card-backs',
      price: item.price,
      enabled: true,
      order: index + 1,
    })),
    blindBoxes: [
      {
        id: 'cardback-blindbox',
        name: '牌背盲盒',
        categoryId: 'blind-box',
        price: 300,
        enabled: true,
        order: 1,
        dropType: 'shopCardBack',
      },
    ],
    holidayGifts: [],
  };
}

function toBool(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback;
}

function cleanInt(value, fallback = 0, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}

class CatalogStore {
  constructor(options = {}) {
    this.catalog = buildDefaultCatalog();
    this.dataFile = options.dataFile || DEFAULT_DATA_FILE;
    this._load();
    this._normalize();
    this._save();
  }

  _load() {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const raw = fs.readFileSync(this.dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.catalog = { ...this.catalog, ...parsed };
      }
    } catch (err) {
      console.error('[CatalogStore] Load error:', err.message);
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.dataFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataFile, JSON.stringify(this.catalog, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CatalogStore] Save error:', err.message);
    }
  }

  _normalize() {
    const defaults = buildDefaultCatalog();
    for (const key of ['shopCategories', 'cardBacks', 'shopItems', 'blindBoxes', 'holidayGifts']) {
      if (!Array.isArray(this.catalog[key])) this.catalog[key] = [];
    }

    this._mergeById('shopCategories', defaults.shopCategories);
    this._mergeById('cardBacks', defaults.cardBacks);
    this._mergeById('shopItems', defaults.shopItems);
    this._mergeById('blindBoxes', defaults.blindBoxes);

    this.catalog.shopCategories = this.catalog.shopCategories.map((item, index) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || item.id || '').trim(),
      order: cleanInt(item.order, index + 1),
      enabled: toBool(item.enabled, true),
    })).filter((item) => item.id && item.name);

    this.catalog.cardBacks = this.catalog.cardBacks.map((item, index) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || item.id || '').trim(),
      type: item.type === 'image' ? 'image' : 'css',
      imageUrl: item.imageUrl || '',
      order: cleanInt(item.order, index),
    })).filter((item) => item.id && item.name && !REMOVED_CARD_BACK_IDS.has(item.id));

    this.catalog.shopItems = this.catalog.shopItems.map((item, index) => ({
      id: String(item.id || '').trim(),
      type: 'cardBack',
      cardBackId: String(item.cardBackId || '').trim(),
      categoryId: String(item.categoryId || 'card-backs').trim(),
      price: cleanInt(item.price, 0),
      enabled: toBool(item.enabled, true),
      order: cleanInt(item.order, index + 1),
    })).filter((item) => item.id && item.cardBackId && !REMOVED_CARD_BACK_IDS.has(item.cardBackId));

    this.catalog.blindBoxes = this.catalog.blindBoxes.map((item, index) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || item.id || '').trim(),
      categoryId: String(item.categoryId || 'blind-box').trim(),
      price: cleanInt(item.price, 300),
      enabled: toBool(item.enabled, true),
      order: cleanInt(item.order, index + 1),
      dropType: 'shopCardBack',
    })).filter((item) => item.id && item.name);

    this.catalog.holidayGifts = this.catalog.holidayGifts.map((gift) =>
      this._normalizeGift(gift),
    ).filter((gift) => gift.id && gift.name);
  }

  _mergeById(key, defaults) {
    const existing = new Set(this.catalog[key].map((item) => item && item.id));
    for (const item of defaults) {
      if (!existing.has(item.id)) this.catalog[key].push(item);
    }
  }

  _normalizeGift(gift = {}) {
    const rewards = Array.isArray(gift.rewards) ? gift.rewards : [];
    return {
      id: String(gift.id || '').trim(),
      name: String(gift.name || '').trim(),
      startsAt: String(gift.startsAt || '').trim(),
      endsAt: String(gift.endsAt || '').trim(),
      enabled: toBool(gift.enabled, true),
      createdAt: cleanInt(gift.createdAt, Date.now()),
      rewards: rewards.map((reward) => this._normalizeReward(reward)).filter(Boolean),
    };
  }

  _normalizeReward(reward = {}) {
    const type = String(reward.type || '').trim();
    if (type === 'coins') {
      const amount = cleanInt(reward.amount, 0, 1);
      return amount > 0 ? { type, amount } : null;
    }
    if (type === 'emotion') {
      const id = String(reward.id || reward.emotionId || '').trim();
      const amount = cleanInt(reward.amount, 0, 1);
      return id && amount > 0 ? { type, id, amount } : null;
    }
    if (type === 'cardBack') {
      const id = String(reward.id || reward.cardBackId || '').trim();
      return id ? { type, id, amount: 1 } : null;
    }
    return null;
  }

  _nextId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  _categoryEnabled(categoryId) {
    const category = this.catalog.shopCategories.find((item) => item.id === categoryId);
    return !category || category.enabled;
  }

  getAllCardBackIds() {
    return this.catalog.cardBacks.map((item) => item.id);
  }

  getCardBack(id) {
    return this.catalog.cardBacks.find((item) => item.id === id) || null;
  }

  getEmotionRewardIds() {
    return ['coffee', 'rose', 'egg', 'slipper'];
  }

  getAdminCatalog() {
    return JSON.parse(JSON.stringify(this.catalog));
  }

  getPublicCatalog() {
    const categories = this.catalog.shopCategories
      .filter((item) => item.enabled)
      .sort((a, b) => a.order - b.order);
    const shopItems = this.catalog.shopItems
      .filter((item) => item.enabled && this._categoryEnabled(item.categoryId))
      .sort((a, b) => a.order - b.order);
    const blindBoxes = this.catalog.blindBoxes
      .filter((item) => item.enabled && this._categoryEnabled(item.categoryId))
      .sort((a, b) => a.order - b.order);
    return {
      shopCategories: categories,
      cardBacks: [...this.catalog.cardBacks].sort((a, b) => a.order - b.order),
      shopItems,
      blindBoxes,
    };
  }

  updateCategory(input = {}) {
    const id = String(input.id || '').trim() || this._nextId('category');
    const category = this.catalog.shopCategories.find((item) => item.id === id);
    const next = category || { id, order: this.catalog.shopCategories.length + 1 };
    if (input.name !== undefined) next.name = String(input.name || '').trim();
    if (!next.name) return { error: '分类名称不能为空' };
    if (input.order !== undefined) next.order = cleanInt(input.order, next.order);
    if (input.enabled !== undefined) next.enabled = !!input.enabled;
    if (!category) this.catalog.shopCategories.push(next);
    this._save();
    return { category: next, catalog: this.getAdminCatalog() };
  }

  updateShopItem(input = {}) {
    const cardBackId = String(input.cardBackId || '').trim();
    if (!this.getCardBack(cardBackId)) return { error: '牌背不存在' };
    const id = String(input.id || '').trim() || `cardback-${cardBackId}`;
    const item = this.catalog.shopItems.find((entry) => entry.id === id);
    const next = item || {
      id,
      type: 'cardBack',
      order: this.catalog.shopItems.length + 1,
      enabled: false,
    };
    next.cardBackId = cardBackId;
    next.categoryId = String(input.categoryId || next.categoryId || 'card-backs').trim();
    next.price = cleanInt(input.price, next.price || 0);
    if (input.enabled !== undefined) next.enabled = !!input.enabled;
    if (input.order !== undefined) next.order = cleanInt(input.order, next.order);
    if (!item) this.catalog.shopItems.push(next);
    this._save();
    return { item: next, catalog: this.getAdminCatalog() };
  }

  updateBlindBox(input = {}) {
    const id = String(input.id || 'cardback-blindbox').trim();
    const box = this.catalog.blindBoxes.find((entry) => entry.id === id);
    if (!box) return { error: '盲盒不存在' };
    if (input.name !== undefined) box.name = String(input.name || '').trim() || box.name;
    if (input.categoryId !== undefined) box.categoryId = String(input.categoryId || '').trim() || box.categoryId;
    if (input.price !== undefined) box.price = cleanInt(input.price, box.price);
    if (input.enabled !== undefined) box.enabled = !!input.enabled;
    this._save();
    return { blindBox: box, catalog: this.getAdminCatalog() };
  }

  getShopItem(id) {
    const item = this.catalog.shopItems.find((entry) => entry.id === id || entry.cardBackId === id);
    if (!item || !item.enabled || !this._categoryEnabled(item.categoryId)) return null;
    return item;
  }

  getBlindBox(id) {
    const box = this.catalog.blindBoxes.find((entry) => entry.id === id);
    if (!box || !box.enabled || !this._categoryEnabled(box.categoryId)) return null;
    return box;
  }

  getBlindBoxDropPool(ownedCardBacks = []) {
    const owned = new Set(ownedCardBacks);
    return this.catalog.shopItems
      .filter((item) => item.enabled && this._categoryEnabled(item.categoryId))
      .filter((item) => !owned.has(item.cardBackId))
      .filter((item) => !!this.getCardBack(item.cardBackId));
  }

  createHolidayGift(input = {}) {
    const gift = this._normalizeGift({
      id: this._nextId('holiday'),
      name: input.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      enabled: input.enabled !== false,
      createdAt: Date.now(),
      rewards: input.rewards,
    });
    const validation = this._validateGift(gift);
    if (validation.error) return validation;
    this.catalog.holidayGifts.push(gift);
    this._save();
    return { gift, catalog: this.getAdminCatalog() };
  }

  updateHolidayGift(input = {}) {
    const id = String(input.id || '').trim();
    const current = this.catalog.holidayGifts.find((gift) => gift.id === id);
    if (!current) return { error: '节日礼物不存在' };
    const next = this._normalizeGift({ ...current, ...input, id: current.id });
    const validation = this._validateGift(next);
    if (validation.error) return validation;
    Object.assign(current, next);
    this._save();
    return { gift: current, catalog: this.getAdminCatalog() };
  }

  disableHolidayGift(id) {
    const gift = this.catalog.holidayGifts.find((entry) => entry.id === id);
    if (!gift) return { error: '节日礼物不存在' };
    gift.enabled = false;
    this._save();
    return { gift, catalog: this.getAdminCatalog() };
  }

  _validateGift(gift) {
    if (!gift.name) return { error: '礼物名称不能为空' };
    const start = Date.parse(gift.startsAt);
    const end = Date.parse(gift.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return { error: '礼物时间不正确' };
    }
    if (!gift.rewards.length) return { error: '礼物奖励不能为空' };
    const cardBackIds = new Set(this.getAllCardBackIds());
    const emotionIds = new Set(this.getEmotionRewardIds());
    for (const reward of gift.rewards) {
      if (reward.type === 'cardBack' && !cardBackIds.has(reward.id)) {
        return { error: `牌背不存在: ${reward.id}` };
      }
      if (reward.type === 'emotion' && !emotionIds.has(reward.id)) {
        return { error: `局内礼物不存在或不能作为库存: ${reward.id}` };
      }
    }
    return {};
  }

  getClaimableHolidayGifts(profile) {
    const claimed = new Set(profile?.claimedHolidayGiftIds || []);
    const now = Date.now();
    return this.catalog.holidayGifts
      .filter((gift) => gift.enabled)
      .filter((gift) => Date.parse(gift.startsAt) <= now && now <= Date.parse(gift.endsAt))
      .filter((gift) => !claimed.has(gift.id))
      .map((gift) => ({
        id: gift.id,
        name: gift.name,
        startsAt: gift.startsAt,
        endsAt: gift.endsAt,
      }));
  }

  getHolidayGift(id) {
    const gift = this.catalog.holidayGifts.find((entry) => entry.id === id);
    if (!gift || !gift.enabled) return null;
    const now = Date.now();
    if (Date.parse(gift.startsAt) > now || now > Date.parse(gift.endsAt)) return null;
    return gift;
  }
}

module.exports = {
  CatalogStore,
  IMAGE_CARD_BACKS,
  buildDefaultCatalog,
};
