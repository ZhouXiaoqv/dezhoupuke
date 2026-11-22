const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-emotion-test-'));
const usersFile = path.join(tmpDir, 'users.json');
const catalogFile = path.join(tmpDir, 'catalog.json');

const { UserStore } = require(path.join(repoRoot, 'server', 'userStore'));
const { CatalogStore } = require(path.join(repoRoot, 'server', 'catalogStore'));
const { EMOTION_CATALOG } = require(path.join(repoRoot, 'server', 'emotionCatalog'));

function assertOk(value, message) {
  assert(!value.error, value.error || message);
}

// Every emotion ships a panel icon next to its animation parts.
for (const emotion of EMOTION_CATALOG) {
  const file = path.join(repoRoot, 'public', 'assets', 'emotions', emotion.id, 'icon.svg');
  assert(fs.existsSync(file), `missing ${file}`);
}

const catalogStore = new CatalogStore({ dataFile: catalogFile });
const userStore = new UserStore({ dataFile: usersFile });
userStore.setCatalogStore(catalogStore);

// Public catalog exposes ordered emotions.
const publicEmotions = catalogStore.getPublicCatalog().emotions;
assert.deepStrictEqual(publicEmotions.map((item) => item.id), EMOTION_CATALOG.map((item) => item.id));
assert(publicEmotions.every((item) => item.enabled && item.label));
assert.deepStrictEqual(catalogStore.getEmotionRewardIds(), ['coffee', 'rose', 'egg', 'slipper']);

// Admin overrides: signed charm is clamped, free emotions stay free.
assertOk(catalogStore.updateEmotion({ id: 'egg', cost: 7, charmDelta: -500, order: 9 }));
let egg = catalogStore.getEmotion('egg');
assert.strictEqual(egg.cost, 7);
assert.strictEqual(egg.charmDelta, -100);
assert.strictEqual(catalogStore.getEmotions().at(-1).id, 'egg');
assertOk(catalogStore.updateEmotion({ id: 'laugh', cost: 50 }));
assert.strictEqual(catalogStore.getEmotion('laugh').cost, 0);
assert.strictEqual(catalogStore.updateEmotion({ id: 'nope' }).error, '表情不存在');

// Overrides persist across reloads.
const reloaded = new CatalogStore({ dataFile: catalogFile });
assert.strictEqual(reloaded.getEmotion('egg').cost, 7);

// sendEmotion uses the overridden price and charm.
assertOk(userStore.register('alice', 'secret1'));
assertOk(userStore.register('bob', 'secret1'));
userStore.users.get('alice').coins = 100;
userStore.users.get('bob').charm = 0;
assertOk(catalogStore.updateEmotion({ id: 'egg', charmDelta: -3 }));
let sent = userStore.sendEmotion('alice', 'bob', 'egg');
assertOk(sent);
assert.strictEqual(sent.purchased, true);
assert.strictEqual(sent.senderProfile.coins, 93);
assert.strictEqual(sent.targetPublic.charm, -3);
assert.strictEqual(sent.emotion.id, 'egg');
assert(!('enabled' in sent.emotion) && !('order' in sent.emotion));

// Bots have no account: the sender pays and no target is updated.
sent = userStore.sendEmotion('alice', null, 'egg');
assertOk(sent);
assert.strictEqual(sent.senderProfile.coins, 86);
assert.strictEqual(sent.targetPublic, null);
assert.strictEqual(sent.targetProfile, null);

// Disabled emotions cannot be sent but keep their inventory.
userStore.users.get('alice').emotionInventory.rose = 2;
assertOk(catalogStore.updateEmotion({ id: 'rose', enabled: false }));
assert.strictEqual(userStore.sendEmotion('alice', 'bob', 'rose').error, '该表情已下架');
assert.strictEqual(userStore.getProfile('alice').emotionInventory.rose, 2);
assert(!catalogStore.getPublicCatalog().emotions.find((item) => item.id === 'rose').enabled);

// Saves are coalesced into one pending write; flush writes synchronously.
userStore.flush();
const before = fs.readFileSync(usersFile, 'utf-8');
for (let i = 0; i < 20; i++) userStore.sendEmotion('alice', 'bob', 'laugh');
assert(userStore._saveTimer, 'save is scheduled');
assert.strictEqual(fs.readFileSync(usersFile, 'utf-8'), before, 'no synchronous write per emotion');
userStore.users.get('bob').charm = 42;
userStore._save();
userStore.flush();
assert.strictEqual(userStore._saveTimer, null);
const saved = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
assert.strictEqual(saved.find((user) => user.username === 'bob').charm, 42);

console.log('PASS emotion catalog and persistence rules');

try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}
