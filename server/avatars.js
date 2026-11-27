'use strict';

// Vector avatars in public/assets/avatars/<id>.svg. Keep in sync with AVATAR_CATALOG in public/js/ui.js.
const AVATAR_IDS = [
  'cyber-hacker',
  'clockwork-gambler',
  'crt-mech',
  'heavy-cyclops',
  'gas-technician',
  'deep-miner',
  'cyber-cat',
  'cyber-spade',
  'clockwork-heart',
  'clockwork-doll',
  'neon-kitsune',
  'astrolabe-duchess',
  'mech-butterfly',
  'gear-rose',
  'pearl-queen',
];
// Defaults draw only from the original nine so existing unset avatars keep their look.
const DEFAULT_AVATAR_POOL = AVATAR_IDS.slice(0, 9);
// Classic emoji avatars, still selectable. Keep in sync with EMOJI_AVATARS in public/js/ui.js.
const EMOJI_AVATARS = [
  '🦊', '🐯', '🐻', '🦅', '🐬', '🦁', '🐼', '🐸', '🦄',
  '🐲', '👻', '🤖', '🧙', '🥷', '🎭', '💀', '🐺', '🦇',
];
const AVATAR_ID_SET = new Set([...AVATAR_IDS, ...EMOJI_AVATARS]);
const BOT_AVATAR = 'crt-mech';
const LEGACY_PLACEHOLDERS = new Set(['', 'A']);

function isAvatarId(value) {
  return AVATAR_ID_SET.has(value);
}

// Stable per-account default so unconfigured players still look distinct.
function defaultAvatar(seed) {
  let hash = 0;
  for (const ch of String(seed || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return DEFAULT_AVATAR_POOL[hash % DEFAULT_AVATAR_POOL.length];
}

// Older accounts stored the letter "A" placeholder; treat it as unset.
function resolveAvatar(value, seed) {
  return typeof value === 'string' && !LEGACY_PLACEHOLDERS.has(value) ? value : defaultAvatar(seed);
}

module.exports = { AVATAR_IDS, BOT_AVATAR, isAvatarId, defaultAvatar, resolveAvatar };
