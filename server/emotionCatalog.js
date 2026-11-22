/**
 * In-room emotion definitions. Price, charm, order, and availability can be
 * overridden by admins through CatalogStore. Animations live client-side in
 * public/js/emotionRigs.js with SVG parts in public/assets/emotions/<id>/.
 */
const EMOTION_CATALOG = [
  {
    id: 'coffee',
    label: '咖啡',
    emoji: '☕',
    cost: 10,
    charmDelta: 2,
  },
  {
    id: 'rose',
    label: '玫瑰花',
    emoji: '🌹',
    cost: 5,
    charmDelta: 1,
  },
  {
    id: 'laugh',
    label: '笑哭',
    emoji: '😂',
    cost: 0,
    charmDelta: 0,
    unlimited: true,
  },
  {
    id: 'egg',
    label: '鸡蛋',
    emoji: '🥚',
    cost: 5,
    charmDelta: -1,
  },
  {
    id: 'slipper',
    label: '拖鞋',
    emoji: '🩴',
    cost: 10,
    charmDelta: -2,
  },
];

const EMOTION_BY_ID = new Map(EMOTION_CATALOG.map((item) => [item.id, item]));
const STOCKED_EMOTION_IDS = EMOTION_CATALOG
  .filter((item) => !item.unlimited)
  .map((item) => item.id);

module.exports = {
  EMOTION_CATALOG,
  EMOTION_BY_ID,
  STOCKED_EMOTION_IDS,
};
