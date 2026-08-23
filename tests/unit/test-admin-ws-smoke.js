const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 3998;
const URL = `ws://localhost:${PORT}`;
const USER_PREFIX = 'wstest';
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
const CATALOG_FILE = path.join(process.cwd(), 'data', 'catalog.json');
const TEST_BLIND_BOX_ID = 'wstest-blindbox';

function cleanupUsers() {
  if (!fs.existsSync(USERS_FILE)) return;
  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const filtered = users.filter((user) => !String(user.username || '').startsWith(USER_PREFIX));
  if (filtered.length !== users.length) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
  }
}

function cleanupCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) return;
  const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  if (!Array.isArray(catalog.blindBoxes)) return;
  const filtered = catalog.blindBoxes.filter((box) => box.id !== TEST_BLIND_BOX_ID);
  if (filtered.length !== catalog.blindBoxes.length) {
    catalog.blindBoxes = filtered;
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectClient() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const messages = [];
    ws.on('open', () => {
      resolve({
        ws,
        messages,
        send(type, data = {}) {
          ws.send(JSON.stringify({ type, data }));
        },
        waitFor(type, timeout = 3000) {
          return new Promise((res, rej) => {
            const started = Date.now();
            const tick = () => {
              const index = messages.findIndex((msg) => msg.type === type);
              if (index >= 0) return res(messages.splice(index, 1)[0]);
              if (Date.now() - started > timeout) return rej(new Error(`Timeout ${type}`));
              setTimeout(tick, 25);
            };
            tick();
          });
        },
      });
    });
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    ws.on('error', reject);
  });
}

async function run() {
  cleanupUsers();
  cleanupCatalog();
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    await wait(1200);

    const admin = await connectClient();
    admin.send('user:login', { username: 'admin', password: 'adminjujku' });
    const adminLogin = await admin.waitFor('user:loggedIn');
    assert.strictEqual(adminLogin.data.profile.role, 'admin');
    assert.strictEqual(adminLogin.data.dailyCheckIn, null);

    admin.send('room:list');
    const roomList = await admin.waitFor('room:list');
    assert.deepStrictEqual(roomList.data.rooms, []);

    admin.send('admin:getDashboard');
    const dashboard = await admin.waitFor('admin:dashboard');
    assert(dashboard.data.catalog);
    assert(Array.isArray(dashboard.data.users));

    admin.send('admin:createBlindBox', {
      id: TEST_BLIND_BOX_ID,
      name: 'WebSocket 测试盲盒',
      price: 888,
      categoryId: 'blind-box',
      dropType: 'cardBackPool',
      cardBackIds: ['onepiece-straw-hat'],
      coverCardBackId: 'onepiece-straw-hat',
      enabled: true,
    });
    const createdCatalog = await admin.waitFor('admin:catalog');
    const createdBox = createdCatalog.data.catalog.blindBoxes.find(
      (box) => box.id === TEST_BLIND_BOX_ID,
    );
    assert(createdBox);
    assert.strictEqual(createdBox.enabled, true);
    assert.deepStrictEqual(createdBox.cardBackIds, ['onepiece-straw-hat']);
    assert.strictEqual(createdBox.coverCardBackId, 'onepiece-straw-hat');

    const player = await connectClient();
    const username = USER_PREFIX + Date.now().toString(36).slice(-6);
    player.send('user:register', { username, password: 'test123' });
    const playerLogin = await player.waitFor('user:registered');
    assert.strictEqual(playerLogin.data.profile.role, 'player');
    player.send('admin:getDashboard');
    const denied = await player.waitFor('admin:error');
    assert(denied.data.message);

    player.send('shop:getCatalog');
    const shopCatalog = await player.waitFor('shop:catalog');
    const onePieceBox = shopCatalog.data.catalog.blindBoxes.find(
      (box) => box.id === 'onepiece-cardback-blindbox',
    );
    const cuteBox = shopCatalog.data.catalog.blindBoxes.find(
      (box) => box.id === 'cute-cardback-blindbox',
    );
    assert(onePieceBox);
    assert(cuteBox);
    assert(Number.isInteger(onePieceBox.price) && onePieceBox.price >= 0);
    assert(Number.isInteger(cuteBox.price) && cuteBox.price >= 0);
    assert.strictEqual(onePieceBox.dropType, 'cardBackPool');
    assert.strictEqual(cuteBox.dropType, 'cardBackPool');
    assert.strictEqual(onePieceBox.cardBackIds.length, 15);
    assert.strictEqual(cuteBox.cardBackIds.length, 9);
    assert(shopCatalog.data.catalog.shopItems.every((item) =>
      !item.cardBackId.startsWith('onepiece-') && !item.cardBackId.startsWith('cute-')
    ));

    admin.ws.close();
    player.ws.close();
    console.log('PASS admin websocket smoke');
  } finally {
    server.kill();
    cleanupUsers();
    cleanupCatalog();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
