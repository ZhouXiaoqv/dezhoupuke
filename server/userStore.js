/**
 * User Store 鈥?JSON file-based persistence for user accounts, stats, and achievements
 * Supports registered users and guest players
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');
const CHECKIN_TIME_ZONE = 'Asia/Shanghai';
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_CHECKIN_REWARDS = [50, 50, 50, 50, 50, 100, 100];
const FULL_WEEK_BONUS = 200;
const DEFAULT_CARD_BACK = 'default-blue';
const EMOTION_CATALOG = [
  { id: 'coffee', emoji: '\u2615', animationSlug: 'coffee', cost: 10, charmDelta: 2 },
  { id: 'rose', emoji: '\uD83C\uDF39', animationSlug: 'rose', cost: 5, charmDelta: 1 },
  { id: 'laugh', emoji: '\uD83D\uDE02', animationSlug: 'laugh-cry', cost: 0, charmDelta: 0, unlimited: true },
  { id: 'egg', emoji: '\uD83E\uDD5A', animationSlug: 'egg', cost: 5, charmDelta: -1 },
  { id: 'slipper', emoji: '\uD83E\uDE74', animationSlug: 'slipper', cost: 10, charmDelta: -2 },
];
const EMOTION_BY_ID = new Map(EMOTION_CATALOG.map((item) => [item.id, item]));
const STOCKED_EMOTION_IDS = EMOTION_CATALOG
  .filter((item) => !item.unlimited)
  .map((item) => item.id);
const CARD_BACK_SHOP = [
  { id: 'solid-white', price: 200 },
  { id: 'solid-purple', price: 200 },
  { id: 'solid-pink', price: 200 },
  { id: 'solid-yellow', price: 200 },
  { id: 'solid-magenta', price: 200 },
  { id: 'solid-black', price: 200 },
  { id: 'solid-beige', price: 200 },
  { id: 'flag-us', price: 600 },
  { id: 'flag-cn', price: 600 },
  { id: 'flag-jp', price: 600 },
  { id: 'flag-uk', price: 600 },
  { id: 'flag-br', price: 600 },
  { id: 'flag-ru', price: 600 },
  { id: 'flag-fr', price: 600 },
  { id: 'flag-de', price: 600 },
  { id: 'pattern-diagonal-pop', price: 400 },
  { id: 'pattern-diagonal-lime', price: 400 },
  { id: 'pattern-vertical-candy', price: 400 },
  { id: 'pattern-vertical-ocean', price: 400 },
  { id: 'pattern-diagonal-peach', price: 400 },
  { id: 'pattern-diagonal-coral', price: 400 },
  { id: 'pattern-vertical-electric', price: 400 },
  { id: 'pattern-vertical-caramel', price: 400 },
  { id: 'pattern-night-stars', price: 400 },
  { id: 'pattern-geo-party', price: 400 },
  { id: 'pattern-geo-retro', price: 400 },
  { id: 'pattern-checker-beige', price: 400 },
  { id: 'pattern-checker-red', price: 400 },
  { id: 'pattern-checker-brick', price: 400 },
  { id: 'pattern-checker-lava', price: 400 },
  { id: 'pattern-checker-peach', price: 400 },
  { id: 'pattern-checker-coral', price: 400 },
  { id: 'pattern-checker-electric', price: 400 },
  { id: 'pattern-checker-caramel', price: 400 },
  { id: 'pattern-checker-classic-beige', price: 400 },
  { id: 'pattern-checker-classic-red', price: 400 },
];
const CARD_BACK_IDS = new Set([DEFAULT_CARD_BACK, ...CARD_BACK_SHOP.map((item) => item.id)]);
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'adminjujku';

// ===== Achievement Definitions =====
const ACHIEVEMENTS = {
  first_win:       { name: 'First Win', desc: 'Win your first hand', icon: 'WIN' },
  ten_wins:        { name: 'Ten Wins', desc: 'Win 10 hands', icon: '10W' },
  fifty_wins:      { name: 'Fifty Wins', desc: 'Win 50 hands', icon: '50W' },
  hundred_wins:    { name: 'Hundred Wins', desc: 'Win 100 hands', icon: '100W' },
  royal_flush:     { name: 'Royal Flush', desc: 'Make a royal flush', icon: 'RF' },
  straight_flush:  { name: 'Straight Flush', desc: 'Make a straight flush', icon: 'SF' },
  four_kind:       { name: 'Four of a Kind', desc: 'Make four of a kind', icon: '4K' },
  full_house:      { name: 'Full House', desc: 'Make a full house', icon: 'FH' },
  flush:           { name: 'Flush', desc: 'Make a flush', icon: 'FL' },
  all_in_5:        { name: 'All-in x5', desc: 'Go all-in 5 times', icon: 'A5' },
  all_in_20:       { name: 'All-in x20', desc: 'Go all-in 20 times', icon: 'A20' },
  big_pot:         { name: 'Big Pot', desc: 'Win a pot over 500', icon: 'P500' },
  huge_pot:        { name: 'Huge Pot', desc: 'Win a pot over 2000', icon: 'P2K' },
  play_50:         { name: 'Play 50', desc: 'Play 50 hands', icon: 'G50' },
  play_200:        { name: 'Play 200', desc: 'Play 200 hands', icon: 'G200' },
  win_streak_3:    { name: 'Win Streak 3', desc: 'Win 3 hands in a row', icon: 'S3' },
  win_streak_5:    { name: 'Win Streak 5', desc: 'Win 5 hands in a row', icon: 'S5' },
  comeback:        { name: 'Comeback', desc: 'Win back over 1000 from under 500', icon: 'CB' },
  bluff_master:    { name: 'Bluff Master', desc: 'Win with high card', icon: 'BM' },
  first_game:      { name: 'First Game', desc: 'Finish your first game', icon: 'G1' },
};

class UserStore {
  constructor(options = {}) {
    this.users = new Map();  // username -> userData
    this.tokens = new Map(); // token -> username
    this.catalogStore = null;
    this.dataFile = options.dataFile || DEFAULT_DATA_FILE;
    this._load();
    this._ensureAdminAccount();
  }

  // ===== Persistence =====
  _load() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf-8');
        const data = JSON.parse(raw);
        for (const u of data) {
          this._ensureAccountState(u);
          if (u.sessionToken && !u.disabled) this.tokens.set(u.sessionToken, u.username);
          this.users.set(u.username, u);
        }
        console.log(`[UserStore] Loaded ${this.users.size} users`);
      }
    } catch (err) {
      console.error('[UserStore] Load error:', err.message);
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.dataFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = [...this.users.values()];
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserStore] Save error:', err.message);
    }
  }

  _hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'poker_salt_2024').digest('hex');
  }

  _generateToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  setCatalogStore(catalogStore) {
    this.catalogStore = catalogStore || null;
    for (const user of this.users.values()) this._ensureAccountState(user);
    this._save();
  }

  _getValidCardBackIds() {
    if (this.catalogStore && typeof this.catalogStore.getAllCardBackIds === 'function') {
      return new Set(this.catalogStore.getAllCardBackIds());
    }
    return CARD_BACK_IDS;
  }

  _getCheckInDay(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CHECKIN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const date = `${map.year}-${map.month}-${map.day}`;
    const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return { date, weekday: weekdayMap[map.weekday] || 1 };
  }

  _dateFromKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  _getWeekStart(dateKey, weekday) {
    const date = this._dateFromKey(dateKey);
    date.setUTCDate(date.getUTCDate() - (weekday - 1));
    return date.toISOString().slice(0, 10);
  }

  _ensureCheckIn(user) {
    if (typeof user.coins !== 'number') user.coins = 0;
    if (!user.checkIn || typeof user.checkIn !== 'object') {
      user.checkIn = {
        lastDate: '',
        weekStart: '',
        days: [],
        fullWeekBonusWeek: '',
      };
    }
    if (!Array.isArray(user.checkIn.days)) user.checkIn.days = [];
    user.checkIn.fullWeekBonusWeek = user.checkIn.fullWeekBonusWeek || '';
  }

  _ensureCardBacks(user) {
    const validCardBackIds = this._getValidCardBackIds();
    if (!Array.isArray(user.ownedCardBacks)) user.ownedCardBacks = [];
    if (!user.ownedCardBacks.includes(DEFAULT_CARD_BACK)) {
      user.ownedCardBacks.unshift(DEFAULT_CARD_BACK);
    }
    user.ownedCardBacks = [...new Set(user.ownedCardBacks)].filter((id) =>
      typeof id === 'string' && id.trim(),
    );
    if (this.catalogStore) {
      user.ownedCardBacks = user.ownedCardBacks.filter((id) => validCardBackIds.has(id));
    }
    if (this.catalogStore && !validCardBackIds.has(user.equippedCardBack)) {
      user.equippedCardBack = DEFAULT_CARD_BACK;
    }
    if (!user.ownedCardBacks.includes(user.equippedCardBack)) {
      user.equippedCardBack = DEFAULT_CARD_BACK;
    }
  }

  _ensureEmotions(user) {
    if (typeof user.charm !== 'number') user.charm = 0;
    if (!user.emotionInventory || typeof user.emotionInventory !== 'object') {
      user.emotionInventory = {};
    }
    for (const id of STOCKED_EMOTION_IDS) {
      const count = Number(user.emotionInventory[id]);
      user.emotionInventory[id] = Number.isFinite(count) && count > 0
        ? Math.floor(count)
        : 0;
    }
    for (const id of Object.keys(user.emotionInventory)) {
      if (!STOCKED_EMOTION_IDS.includes(id)) delete user.emotionInventory[id];
    }
  }

  _ensureStats(user) {
    if (!user.stats || typeof user.stats !== 'object') user.stats = {};
    const defaults = {
      handsPlayed: 0,
      handsWon: 0,
      totalWon: 0,
      totalLost: 0,
      biggestPot: 0,
      bestHand: '',
      bestHandRank: -1,
      allIns: 0,
      winStreak: 0,
      bestWinStreak: 0,
      currentStreak: 0,
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value === 'number') {
        if (typeof user.stats[key] !== 'number') user.stats[key] = value;
      } else if (typeof user.stats[key] !== 'string') {
        user.stats[key] = value;
      }
    }
    if (typeof user.stats.totalProfit !== 'number') {
      user.stats.totalProfit = (user.stats.totalWon || 0) - (user.stats.totalLost || 0);
    }
  }

  _ensureAccountState(user) {
    user.role = user.role === 'admin' ? 'admin' : 'player';
    user.disabled = !!user.disabled;
    if (!Array.isArray(user.claimedHolidayGiftIds)) user.claimedHolidayGiftIds = [];
    this._ensureCheckIn(user);
    this._ensureCardBacks(user);
    this._ensureEmotions(user);
    this._ensureStats(user);
  }

  _ensureAdminAccount() {
    const existing = this.users.get(ADMIN_USERNAME);
    if (existing) {
      existing.passwordHash = this._hashPassword(ADMIN_PASSWORD);
      existing.role = 'admin';
      existing.disabled = false;
      this._ensureAccountState(existing);
      return;
    }
    const admin = {
      username: ADMIN_USERNAME,
      passwordHash: this._hashPassword(ADMIN_PASSWORD),
      role: 'admin',
      disabled: false,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      sessionToken: null,
      sessionIssuedAt: null,
      avatar: 'A',
      avatarColor: '#d4a840',
      coins: 0,
      charm: 0,
      emotionInventory: Object.fromEntries(STOCKED_EMOTION_IDS.map((id) => [id, 0])),
      ownedCardBacks: [DEFAULT_CARD_BACK],
      equippedCardBack: DEFAULT_CARD_BACK,
      claimedHolidayGiftIds: [],
      checkIn: { lastDate: '', weekStart: '', days: [], fullWeekBonusWeek: '' },
      stats: {
        handsPlayed: 0,
        handsWon: 0,
        totalWon: 0,
        totalLost: 0,
        totalProfit: 0,
        biggestPot: 0,
        bestHand: '',
        bestHandRank: -1,
        allIns: 0,
        winStreak: 0,
        bestWinStreak: 0,
        currentStreak: 0,
      },
      achievements: [],
      gamesPlayed: 0,
    };
    this._ensureAccountState(admin);
    this.users.set(ADMIN_USERNAME, admin);
  }

  // ===== Registration =====
  register(username, password) {
    username = (username || '').trim();
    if (!username || username.length < 1 || username.length > 12) {
      return { error: 'Username must be 1-12 characters' };
    }
    if (!password || password.length < 4) {
      return { error: 'Password must be at least 4 characters' };
    }
    if (this.users.has(username)) {
      return { error: 'Username already registered' };
    }

    const user = {
      username,
      passwordHash: this._hashPassword(password),
      role: 'player',
      disabled: false,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      sessionToken: null,
      sessionIssuedAt: null,
      avatar: 'A',  // Selected avatar emoji
      avatarColor: '#4fc3f7',  // Selected color
      coins: 0,
      charm: 0,
      emotionInventory: Object.fromEntries(STOCKED_EMOTION_IDS.map((id) => [id, 0])),
      ownedCardBacks: [DEFAULT_CARD_BACK],
      equippedCardBack: DEFAULT_CARD_BACK,
      checkIn: {
        lastDate: '',
        weekStart: '',
        days: [],
        fullWeekBonusWeek: '',
      },
      stats: {
        handsPlayed: 0,
        handsWon: 0,
        totalWon: 0,
        totalLost: 0,
        totalProfit: 0,
        biggestPot: 0,
        bestHand: '',
        bestHandRank: -1,
        allIns: 0,
        winStreak: 0,
        bestWinStreak: 0,
        currentStreak: 0,
      },
      achievements: [],
      gamesPlayed: 0,
      claimedHolidayGiftIds: [],
    };

    this.users.set(username, user);
    const token = this._issueSession(user);
    this._save();

    return { token, username, profile: this._sanitize(user) };
  }

  // ===== Login =====
  login(username, password) {
    username = (username || '').trim();
    const user = this.users.get(username);
    if (!user) return { error: 'User not found' };
    this._ensureAccountState(user);
    if (user.disabled) return { error: 'Account disabled' };
    if (user.passwordHash !== this._hashPassword(password)) {
      return { error: 'Incorrect password' };
    }
    user.lastLogin = Date.now();
    const token = this._issueSession(user);
    this._save();

    return { token, username, profile: this._sanitize(user) };
  }

  // ===== Token Validation =====
  validateToken(token) {
    if (!token) return null;
    const username = this.tokens.get(token);
    if (!username) return null;
    const user = this.users.get(username);
    if (!user || user.sessionToken !== token) return null;
    this._ensureAccountState(user);
    if (user.disabled) return null;
    user.lastLogin = Date.now();
    user.sessionIssuedAt = Date.now();
    this.tokens.set(token, username);
    this._save();
    return { username, profile: this._sanitize(user) };
  }

  // ===== Daily Check-in =====
  applyDailyCheckIn(username) {
    const user = this.users.get(username);
    if (!user) return null;
    this._ensureAccountState(user);
    if (user.role === 'admin') return null;

    const today = this._getCheckInDay();
    const weekStart = this._getWeekStart(today.date, today.weekday);
    if (user.checkIn.lastDate === today.date) {
      return null;
    }

    if (user.checkIn.weekStart !== weekStart) {
      user.checkIn.weekStart = weekStart;
      user.checkIn.days = [];
      user.checkIn.fullWeekBonusWeek = '';
    }

    if (!user.checkIn.days.includes(today.date)) {
      user.checkIn.days.push(today.date);
      user.checkIn.days.sort();
    }
    user.checkIn.lastDate = today.date;

    const dailyReward = DAILY_CHECKIN_REWARDS[today.weekday - 1] || 50;
    let bonus = 0;
    if (
      user.checkIn.days.length >= 7 &&
      user.checkIn.fullWeekBonusWeek !== weekStart
    ) {
      bonus = FULL_WEEK_BONUS;
      user.checkIn.fullWeekBonusWeek = weekStart;
    }

    const totalReward = dailyReward + bonus;
    user.coins += totalReward;
    const emotionRewards = {};
    for (const id of STOCKED_EMOTION_IDS) {
      user.emotionInventory[id] += 1;
      emotionRewards[id] = 1;
    }
    this._save();

    return {
      date: today.date,
      weekday: today.weekday,
      dailyReward,
      bonus,
      totalReward,
      coins: user.coins,
      emotionRewards,
      emotionInventory: { ...user.emotionInventory },
      weekStart,
      checkedDays: [...user.checkIn.days],
      fullWeek: bonus > 0,
      profile: this._sanitize(user),
    };
  }

  // ===== Record Game Result =====
  recordGame(username, data) {
    const user = this.users.get(username);
    if (!user) return { newAchievements: [] };
    this._ensureAccountState(user);

    const s = user.stats;
    const amount = Number(data.amount || 0);
    const net = Number.isFinite(Number(data.net))
      ? Number(data.net)
      : data.won
        ? amount
        : -Number(data.amount || 0);
    s.handsPlayed++;
    user.gamesPlayed = (user.gamesPlayed || 0) + 1;
    s.totalProfit += net;
    if (net < 0) s.totalLost += Math.abs(net);

    if (data.won) {
      s.handsWon++;
      s.totalWon += amount;
      s.currentStreak = (s.currentStreak || 0) + 1;
      if (s.currentStreak > (s.bestWinStreak || 0)) {
        s.bestWinStreak = s.currentStreak;
      }
      if (amount > s.biggestPot) {
        s.biggestPot = amount;
      }
    } else {
      s.currentStreak = 0;
    }

    if (data.allIn) s.allIns = (s.allIns || 0) + 1;

    if (data.handRank > s.bestHandRank) {
      s.bestHandRank = data.handRank;
      s.bestHand = data.handName || '';
    }

    // Check achievements
    const newAchievements = this._checkAchievements(user, data);
    this._save();

    return { newAchievements, profile: this._sanitize(user) };
  }


  // ===== Update Avatar =====
  updateAvatar(username, avatar, color) {
    const user = this.users.get(username);
    if (!user) return null;
    if (avatar) user.avatar = avatar;
    if (color) user.avatarColor = color;
    this._save();
    return { avatar: user.avatar, avatarColor: user.avatarColor };
  }

  buyCardBack(username, cardBackId) {
    const user = this.users.get(username);
    if (!user) return { error: 'User not found' };
    this._ensureAccountState(user);
    if (user.disabled || user.role !== 'player') return { error: 'Permission denied' };

    const item = this.catalogStore
      ? this.catalogStore.getShopItem(cardBackId)
      : CARD_BACK_SHOP.find((entry) => entry.id === cardBackId);
    if (!item) return { error: 'Card back not found' };
    const resolvedCardBackId = item.cardBackId || item.id;
    if (user.ownedCardBacks.includes(resolvedCardBackId)) {
      return { error: 'Card back already owned' };
    }
    if (user.coins < item.price) {
      return { error: 'Not enough coins' };
    }

    user.coins -= item.price;
    user.ownedCardBacks.push(resolvedCardBackId);
    this._save();
    return {
      id: resolvedCardBackId,
      price: item.price,
      profile: this._sanitize(user),
    };
  }

  buyBlindBox(username, boxId, rng = Math.random) {
    const user = this.users.get(username);
    if (!user) return { error: 'User not found' };
    this._ensureAccountState(user);
    if (user.disabled || user.role !== 'player') return { error: 'Permission denied' };
    if (!this.catalogStore) return { error: 'Shop not ready' };

    const box = this.catalogStore.getBlindBox(boxId || 'cardback-blindbox');
    if (!box) return { error: 'Blind box not found' };
    const pool = this.catalogStore.getBlindBoxDropPool(user.ownedCardBacks);
    if (pool.length === 0) return { error: 'No available card backs in blind box' };
    if (user.coins < box.price) return { error: 'Not enough coins' };

    const index = Math.max(0, Math.min(pool.length - 1, Math.floor(rng() * pool.length)));
    const picked = pool[index];
    user.coins -= box.price;
    user.ownedCardBacks.push(picked.cardBackId);
    this._ensureAccountState(user);
    this._save();
    return {
      blindBox: box,
      cardBackId: picked.cardBackId,
      price: box.price,
      pool: pool.map((item) => item.cardBackId),
      profile: this._sanitize(user),
    };
  }

  updateCardBack(username, cardBackId) {
    const user = this.users.get(username);
    if (!user) return { error: 'User not found' };
    this._ensureAccountState(user);
    const nextId = cardBackId || DEFAULT_CARD_BACK;
    if (!this._getValidCardBackIds().has(nextId)) return { error: 'Card back not found' };
    if (!user.ownedCardBacks.includes(nextId)) {
      return { error: 'Card back not owned' };
    }
    user.equippedCardBack = nextId;
    this._save();
    return {
      equippedCardBack: user.equippedCardBack,
      ownedCardBacks: [...user.ownedCardBacks],
      profile: this._sanitize(user),
    };
  }

  sendEmotion(fromUsername, toUsername, emotionId) {
    const sender = this.users.get(fromUsername);
    const target = this.users.get(toUsername);
    if (!sender || !target) return { error: 'User not found' };
    if (sender.disabled || target.disabled) return { error: 'User not found' };
    if (fromUsername === toUsername) return { error: 'Cannot send emotion to yourself' };

    this._ensureAccountState(sender);
    this._ensureAccountState(target);

    const emotion = EMOTION_BY_ID.get(emotionId);
    if (!emotion) return { error: 'Emotion not found' };

    let usedInventory = false;
    let purchased = false;
    if (!emotion.unlimited) {
      if ((sender.emotionInventory[emotion.id] || 0) > 0) {
        sender.emotionInventory[emotion.id] -= 1;
        usedInventory = true;
      } else {
        if (sender.coins < emotion.cost) return { error: 'Not enough coins' };
        sender.coins -= emotion.cost;
        purchased = true;
      }
    }

    target.charm += emotion.charmDelta || 0;
    this._save();

    return {
      emotion: { ...emotion },
      usedInventory,
      purchased,
      senderProfile: this._sanitize(sender),
      targetProfile: this._sanitize(target),
      senderPublic: this._publicProfile(sender),
      targetPublic: this._publicProfile(target),
    };
  }

  applyHolidayGift(username, gift) {
    const user = this.users.get(username);
    if (!user) return { error: 'User not found' };
    this._ensureAccountState(user);
    if (user.disabled || user.role !== 'player') return { error: 'Permission denied' };
    if (!gift || !gift.id) return { error: 'Gift not found' };
    if (user.claimedHolidayGiftIds.includes(gift.id)) return { error: 'Gift already claimed' };

    const granted = [];
    const skipped = [];
    for (const reward of gift.rewards || []) {
      if (reward.type === 'coins') {
        const amount = Math.max(0, Math.floor(Number(reward.amount || 0)));
        if (amount > 0) {
          user.coins += amount;
          granted.push({ type: 'coins', amount });
        }
      } else if (reward.type === 'emotion') {
        const id = reward.id || reward.emotionId;
        const amount = Math.max(0, Math.floor(Number(reward.amount || 0)));
        if (STOCKED_EMOTION_IDS.includes(id) && amount > 0) {
          user.emotionInventory[id] = (user.emotionInventory[id] || 0) + amount;
          granted.push({ type: 'emotion', id, amount });
        }
      } else if (reward.type === 'cardBack') {
        const id = reward.id || reward.cardBackId;
        if (this._getValidCardBackIds().has(id) && !user.ownedCardBacks.includes(id)) {
          user.ownedCardBacks.push(id);
          granted.push({ type: 'cardBack', id, amount: 1 });
        } else {
          const duplicate = { type: 'cardBack', id, amount: 1, duplicate: true };
          granted.push(duplicate);
          skipped.push({ ...duplicate, reason: 'owned' });
        }
      }
    }

    user.claimedHolidayGiftIds.push(gift.id);
    this._ensureAccountState(user);
    this._save();
    return {
      gift: { id: gift.id, name: gift.name },
      rewards: granted,
      skipped,
      profile: this._sanitize(user),
    };
  }

  listUsers() {
    return [...this.users.values()]
      .map((user) => {
        this._ensureAccountState(user);
        return {
          username: user.username,
          role: user.role,
          disabled: !!user.disabled,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          coins: user.coins || 0,
          handsPlayed: user.stats?.handsPlayed || 0,
        };
      })
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));
  }

  disableUser(username, actorUsername) {
    const target = this.users.get(String(username || '').trim());
    if (!target) return { error: 'User not found' };
    this._ensureAccountState(target);
    if (target.role === 'admin') return { error: 'Cannot delete admin account' };
    if (target.username === actorUsername) return { error: 'Cannot delete current account' };
    target.disabled = true;
    if (target.sessionToken) this.tokens.delete(target.sessionToken);
    target.sessionToken = null;
    target.sessionIssuedAt = null;
    this._save();
    return { user: { username: target.username, disabled: true } };
  }

  isAdmin(username) {
    const user = this.users.get(username);
    if (!user) return false;
    this._ensureAccountState(user);
    return user.role === 'admin' && !user.disabled;
  }

  isPlayer(username) {
    const user = this.users.get(username);
    if (!user) return false;
    this._ensureAccountState(user);
    return user.role === 'player' && !user.disabled;
  }

  // ===== Achievement Checking =====
  _checkAchievements(user, data) {
    const s = user.stats;
    const newOnes = [];

    function check(id, condition) {
      if (condition && !user.achievements.includes(id)) {
        user.achievements.push(id);
        newOnes.push({ id, ...ACHIEVEMENTS[id] });
      }
    }

    // Win-based
    check('first_win', data.won && s.handsWon >= 1);
    check('ten_wins', s.handsWon >= 10);
    check('fifty_wins', s.handsWon >= 50);
    check('hundred_wins', s.handsWon >= 100);

    // Hand type
    check('royal_flush', data.handRank === 9);
    check('straight_flush', data.handRank === 8);
    check('four_kind', data.handRank === 7);
    check('full_house', data.handRank === 6);
    check('flush', data.handRank === 5);

    // All-in
    check('all_in_5', s.allIns >= 5);
    check('all_in_20', s.allIns >= 20);

    // Pot size
    check('big_pot', data.won && data.amount >= 500);
    check('huge_pot', data.won && data.amount >= 2000);

    // Play count
    check('play_50', s.handsPlayed >= 50);
    check('play_200', s.handsPlayed >= 200);

    // Win streak
    check('win_streak_3', s.currentStreak >= 3);
    check('win_streak_5', s.currentStreak >= 5);

    // Comeback
    check('comeback', data.won && data.stackBefore < 500 && data.amount >= 1000);

    // Bluff master (won with high card)
    check('bluff_master', data.won && data.handRank === 0);

    // First game
    check('first_game', s.handsPlayed >= 1);

    return newOnes;
  }

  // ===== Get Profile =====
  getProfile(username) {
    const user = this.users.get(username);
    if (!user) return null;
    this._ensureAccountState(user);
    return this._sanitize(user);
  }

  getPublicProfile(username) {
    const user = this.users.get(username);
    if (!user) return null;
    this._ensureAccountState(user);
    return this._publicProfile(user);
  }

  // ===== Leaderboard =====
  getLeaderboard(sortBy = 'totalWon', limit = 20) {
    const list = [...this.users.values()].filter((user) => user.role !== 'admin' && !user.disabled);
    for (const user of list) this._ensureAccountState(user);
    const statKey = sortBy === 'totalWon' ? 'totalProfit' : sortBy;
    list.sort((a, b) => (b.stats[statKey] || 0) - (a.stats[statKey] || 0));
    return list.slice(0, limit).map((u, i) => ({
      rank: i + 1,
      name: u.username,
      handsPlayed: u.stats.handsPlayed,
      handsWon: u.stats.handsWon,
      winRate: u.stats.handsPlayed > 0 ? Math.round(u.stats.handsWon / u.stats.handsPlayed * 100) : 0,
      totalWon: u.stats.totalProfit,
      totalProfit: u.stats.totalProfit,
      charm: u.charm || 0,
      biggestPot: u.stats.biggestPot,
      bestHand: u.stats.bestHand || '-',
      allIns: u.stats.allIns || 0,
      achievementCount: u.achievements.length,
    }));
  }

  // Remove private fields
  _sanitize(user) {
    this._ensureAccountState(user);
    return {
      username: user.username,
      role: user.role || 'player',
      disabled: !!user.disabled,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      avatar: user.avatar || 'A',
      avatarColor: user.avatarColor || '#4fc3f7',
      coins: typeof user.coins === 'number' ? user.coins : 0,
      charm: typeof user.charm === 'number' ? user.charm : 0,
      emotionInventory: { ...user.emotionInventory },
      ownedCardBacks: [...user.ownedCardBacks],
      equippedCardBack: user.equippedCardBack || DEFAULT_CARD_BACK,
      checkIn: user.checkIn
        ? {
            lastDate: user.checkIn.lastDate || '',
            weekStart: user.checkIn.weekStart || '',
            days: Array.isArray(user.checkIn.days) ? [...user.checkIn.days] : [],
            fullWeekBonusWeek: user.checkIn.fullWeekBonusWeek || '',
          }
        : { lastDate: '', weekStart: '', days: [], fullWeekBonusWeek: '' },
      stats: { ...user.stats },
      achievements: user.achievements.map(id => ({ id, ...ACHIEVEMENTS[id] })),
      gamesPlayed: user.gamesPlayed || 0,
      claimedHolidayGiftIds: [...user.claimedHolidayGiftIds],
    };
  }

  _publicProfile(user) {
    this._ensureAccountState(user);
    const s = user.stats;
    return {
      username: user.username,
      avatar: user.avatar || 'A',
      avatarColor: user.avatarColor || '#4fc3f7',
      charm: user.charm || 0,
      stats: {
        handsPlayed: s.handsPlayed || 0,
        handsWon: s.handsWon || 0,
        winRate: s.handsPlayed > 0 ? Math.round((s.handsWon / s.handsPlayed) * 100) : 0,
        totalProfit: s.totalProfit || 0,
      },
    };
  }

  // Get all achievement definitions
  static getAllAchievements() {
    return ACHIEVEMENTS;
  }

  _issueSession(user) {
    if (user.sessionToken) this.tokens.delete(user.sessionToken);
    const token = this._generateToken();
    user.sessionToken = token;
    user.sessionIssuedAt = Date.now();
    this.tokens.set(token, user.username);
    return token;
  }
}

module.exports = {
  UserStore,
  ACHIEVEMENTS,
  CARD_BACK_SHOP,
  DEFAULT_CARD_BACK,
  EMOTION_CATALOG,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
};
