/**
 * Logger — unified structured log system
 *
 * Writes one JSON line per event to data/logs/server-YYYY-MM-DD.log
 * Rotates daily; keeps the last 7 days.
 *
 * Levels (ascending severity): DEBUG < INFO < WARN < ERROR
 * Set LOG_LEVEL env var to control minimum level (default: DEBUG).
 *
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('ROOM', 'player_join', { roomCode: 'ABCD', playerName: '小明', msg: '...' });
 *   logger.debug('GAME', 'hand_action', { ... });
 *   logger.warn('NET', 'heartbeat_timeout', { playerId: 'p0' });
 *   logger.error('SYS', 'save_fail', { err: err.message });
 */

const fs   = require('fs');
const path = require('path');

const LOG_DIR      = path.join(__dirname, '..', 'data', 'logs');
const KEEP_DAYS    = 7;
const LEVEL_ORDER  = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MIN_LEVEL    = (process.env.LOG_LEVEL || 'DEBUG').toUpperCase();
const MIN_LEVEL_N  = LEVEL_ORDER[MIN_LEVEL] ?? 0;

class Logger {
  constructor() {
    this._ensureDir();
    this._currentDate = '';
    this._currentFile = '';
    this._cleanupDone = false;
  }

  _ensureDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  /** Returns today's date string in local Asia/Shanghai time (YYYY-MM-DD). */
  _today() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day}`;
  }

  /** Resolves today's log file path, rotates if date changed. */
  _getFile() {
    const today = this._today();
    if (today !== this._currentDate) {
      this._currentDate = today;
      this._currentFile = path.join(LOG_DIR, `server-${today}.log`);
      // Cleanup old files once per date change
      if (!this._cleanupDone || today !== this._currentDate) {
        this._cleanup(today);
        this._cleanupDone = true;
      }
    }
    return this._currentFile;
  }

  /** Remove log files older than KEEP_DAYS. */
  _cleanup(today) {
    try {
      const files = fs.readdirSync(LOG_DIR).filter((f) => /^server-\d{4}-\d{2}-\d{2}\.log$/.test(f));
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
      for (const f of files) {
        const dateStr = f.slice(7, 17); // "server-2026-06-15.log" → "2026-06-15"
        if (new Date(dateStr) < cutoff) {
          fs.unlinkSync(path.join(LOG_DIR, f));
        }
      }
    } catch (err) {
      console.error('[Logger] Cleanup error:', err.message);
    }
  }

  _write(level, category, event, fields = {}) {
    if ((LEVEL_ORDER[level] ?? 0) < MIN_LEVEL_N) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      category,
      event,
      ...fields,
    };

    const line = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(this._getFile(), line, 'utf8');
    } catch (err) {
      console.error('[Logger] Write error:', err.message);
    }

    // Also mirror WARN/ERROR to console for pm2 stdout capture
    if (LEVEL_ORDER[level] >= LEVEL_ORDER.WARN) {
      const prefix = `[${level}][${category}] ${event}`;
      const msg = fields.msg || fields.err || '';
      console.error(`${prefix}${msg ? ': ' + msg : ''}`);
    }
  }

  debug(category, event, fields) { this._write('DEBUG', category, event, fields); }
  info(category, event, fields)  { this._write('INFO',  category, event, fields); }
  warn(category, event, fields)  { this._write('WARN',  category, event, fields); }
  error(category, event, fields) { this._write('ERROR', category, event, fields); }
}

module.exports = new Logger();
