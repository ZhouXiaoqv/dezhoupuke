const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 3998;
const URL = `ws://localhost:${PORT}`;
const USER_PREFIX = 'wstest';
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

function cleanupUsers() {
  if (!fs.existsSync(USERS_FILE)) return;
  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const filtered = users.filter((user) => !String(user.username || '').startsWith(USER_PREFIX));
  if (filtered.length !== users.length) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
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

    const player = await connectClient();
    const username = USER_PREFIX + Date.now().toString(36).slice(-6);
    player.send('user:register', { username, password: 'test123' });
    const playerLogin = await player.waitFor('user:registered');
    assert.strictEqual(playerLogin.data.profile.role, 'player');
    player.send('admin:getDashboard');
    const denied = await player.waitFor('admin:error');
    assert(denied.data.message);

    admin.ws.close();
    player.ws.close();
    console.log('PASS admin websocket smoke');
  } finally {
    server.kill();
    cleanupUsers();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
