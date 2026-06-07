/**
 * User Store 鈥?JSON file-based persistence for user accounts, stats, and achievements
 * Supports registered users and guest players
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');
const CHECKIN_TIME_ZONE = 'Asia/Shanghai';
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_CHECKIN_REWARDS = [50, 50, 50, 50, 50, 100, 100];
const FULL_WEEK_BONUS = 200;
const DEFAULT_CARD_BACK = 'default-blue';
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
  { id: 'pattern-stripes', price: 400 },
  { id: 'pattern-blocks', price: 400 },
  { id: 'pattern-checker', price: 400 },
  { id: 'pattern-star', price: 400 },
  { id: 'pattern-burst', price: 400 },
];
const CARD_BACK_IDS = new Set([DEFAULT_CARD_BACK, ...CARD_BACK_SHOP.map((item) => item.id)]);

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
  constructor() {
    this.users = new Map();  // username -> userData
    this.tokens = new Map(); // token -> username
    this._load();
  }

  // ===== Persistence =====
  _load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const u of data) {
          if (u.sessionToken) this.tokens.set(u.sessionToken, u.username);
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
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = [...this.users.values()];
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
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
    if (!Array.isArray(user.ownedCardBacks)) user.ownedCardBacks = [];
    if (!user.ownedCardBacks.includes(DEFAULT_CARD_BACK)) {
      user.ownedCardBacks.unshift(DEFAULT_CARD_BACK);
    }
    user.ownedCardBacks = [...new Set(user.ownedCardBacks)].filter((id) =>
      CARD_BACK_IDS.has(id),
    );
    if (!CARD_BACK_IDS.has(user.equippedCardBack)) {
      user.equippedCardBack = DEFAULT_CARD_BACK;
    }
    if (!user.ownedCardBacks.includes(user.equippedCardBack)) {
      user.equippedCardBack = DEFAULT_CARD_BACK;
    }
  }

  _ensureAccountState(user) {
    this._ensureCheckIn(user);
    this._ensureCardBacks(user);
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
      createdAt: Date.now(),
      lastLogin: Date.now(),
      sessionToken: null,
      sessionIssuedAt: null,
      avatar: 'A',  // Selected avatar emoji
      avatarColor: '#4fc3f7',  // Selected color
      coins: 0,
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
    if (user.passwordHash !== this._hashPassword(password)) {
      return { error: 'Incorrect password' };
    }

    this._ensureAccountState(user);
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
    this._save();

    return {
      date: today.date,
      weekday: today.weekday,
      dailyReward,
      bonus,
      totalReward,
      coins: user.coins,
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

    const s = user.stats;
    s.handsPlayed++;
    user.gamesPlayed = (user.gamesPlayed || 0) + 1;

    if (data.won) {
      s.handsWon++;
      s.totalWon += data.amount || 0;
      s.currentStreak = (s.currentStreak || 0) + 1;
      if (s.currentStreak > (s.bestWinStreak || 0)) {
        s.bestWinStreak = s.currentStreak;
      }
      if ((data.amount || 0) > s.biggestPot) {
        s.biggestPot = data.amount || 0;
      }
    } else {
      s.totalLost += data.amount || 0;
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

    const item = CARD_BACK_SHOP.find((entry) => entry.id === cardBackId);
    if (!item) return { error: 'Card back not found' };
    if (user.ownedCardBacks.includes(cardBackId)) {
      return { error: 'Card back already owned' };
    }
    if (user.coins < item.price) {
      return { error: 'Not enough coins' };
    }

    user.coins -= item.price;
    user.ownedCardBacks.push(cardBackId);
    this._save();
    return {
      id: cardBackId,
      price: item.price,
      profile: this._sanitize(user),
    };
  }

  updateCardBack(username, cardBackId) {
    const user = this.users.get(username);
    if (!user) return { error: 'User not found' };
    this._ensureAccountState(user);
    const nextId = cardBackId || DEFAULT_CARD_BACK;
    if (!CARD_BACK_IDS.has(nextId)) return { error: 'Card back not found' };
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

  // ===== Leaderboard =====
  getLeaderboard(sortBy = 'totalWon', limit = 20) {
    const list = [...this.users.values()];
    list.sort((a, b) => (b.stats[sortBy] || 0) - (a.stats[sortBy] || 0));
    return list.slice(0, limit).map((u, i) => ({
      rank: i + 1,
      name: u.username,
      handsPlayed: u.stats.handsPlayed,
      handsWon: u.stats.handsWon,
      winRate: u.stats.handsPlayed > 0 ? Math.round(u.stats.handsWon / u.stats.handsPlayed * 100) : 0,
      totalWon: u.stats.totalWon,
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
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      avatar: user.avatar || 'A',
      avatarColor: user.avatarColor || '#4fc3f7',
      coins: typeof user.coins === 'number' ? user.coins : 0,
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
};
