/**
 * Test in-room emotions: compact broadcast, no state re-broadcast, rate limit
 */
const WebSocket = require('ws');

const URL = process.env.POKER_TEST_URL.replace('http:', 'ws:');
let passed = 0, failed = 0;
const RUN_ID = Date.now().toString(36);

function assert(cond, msg) {
  if (cond) { console.log(`  PASS ${msg}`); passed++; }
  else { console.log(`  FAIL ${msg}`); failed++; }
}

function createClient(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const messages = [];
    const username = `${name}${RUN_ID}`.slice(0, 12);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'user:register', data: { username, password: 'test123' } }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (msg.type === 'user:registered') {
        resolve({ ws, playerId: msg.data.playerId, messages, send(type, data = {}) {
          ws.send(JSON.stringify({ type, data }));
        }});
      }
    });
    ws.on('error', reject);
  });
}

function waitForMessage(client, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    const check = () => {
      const idx = client.messages.findIndex(m => m.type === type);
      if (idx >= 0) {
        clearTimeout(timer);
        resolve(client.messages.splice(idx, 1)[0]);
      } else {
        setTimeout(check, 30);
      }
    };
    check();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('\n=== Emotion Test ===\n');

  const sender = await createClient('EmoA');
  const target = await createClient('EmoB');
  sender.send('room:create', { name: 'EmoA' });
  const { data: { code } } = await waitForMessage(sender, 'room:created');
  target.send('room:join', { code, name: 'EmoB' });
  await waitForMessage(target, 'room:joined');
  await sleep(300);
  sender.messages.length = 0;
  target.messages.length = 0;

  console.log('1. One emotion produces a compact broadcast and no state refresh...');
  sender.send('room:interact', { targetId: target.playerId, emotionId: 'laugh' });
  const seen = await waitForMessage(target, 'room:interact');
  assert(seen.data.fromId === sender.playerId && seen.data.toId === target.playerId, 'Broadcast names sender and target');
  assert(seen.data.emotion.id === 'laugh', 'Broadcast carries the emotion');
  assert(Number.isFinite(seen.data.targetCharm), 'Broadcast carries target charm');
  assert(!('senderPublic' in seen.data) && !('targetPublic' in seen.data), 'Broadcast omits full public profiles');
  await waitForMessage(sender, 'user:profileUpdated');
  await sleep(300);
  const refreshes = target.messages.filter(m => m.type === 'room:players' || m.type === 'game:state');
  assert(refreshes.length === 0, `No room:players or game:state follows (got ${refreshes.length})`);

  console.log('2. A rapid burst is limited but every accepted emotion is broadcast...');
  await sleep(2100); // refill the bucket
  sender.messages.length = 0;
  target.messages.length = 0;
  for (let i = 0; i < 12; i++) {
    sender.send('room:interact', { targetId: target.playerId, emotionId: 'laugh' });
  }
  await sleep(600);
  const accepted = target.messages.filter(m => m.type === 'room:interact').length;
  const limited = sender.messages.filter(m => m.type === 'room:error' && m.data.message.includes('太快')).length;
  assert(accepted >= 8 && accepted <= 10, `Burst of 12 delivers 8-10 emotions (got ${accepted})`);
  assert(accepted + limited === 12, `Every rejected send is reported to the sender (${limited} rejected)`);

  console.log('3. Sending to yourself is rejected...');
  sender.messages.length = 0;
  sender.send('room:interact', { targetId: sender.playerId, emotionId: 'laugh' });
  const err = await waitForMessage(sender, 'room:error');
  assert(err.data.message === '不能给自己发表情', 'Self-target error');

  console.log('4. Bots can receive emotions without charm...');
  await sleep(600); // refill the bucket
  sender.messages.length = 0;
  sender.send('room:addBot');
  let bot = null;
  for (let i = 0; i < 20 && !bot; i++) {
    const list = await waitForMessage(sender, 'room:players');
    bot = list.data.players.find(p => p.isBot);
  }
  assert(bot, 'Host added a bot');
  sender.messages.length = 0;
  sender.send('room:interact', { targetId: bot.id, emotionId: 'laugh' });
  const botSeen = await waitForMessage(sender, 'room:interact');
  assert(botSeen.data.toId === bot.id && botSeen.data.targetCharm === null, 'Emotion to bot is broadcast with no charm');
  assert(!sender.messages.some(m => m.type === 'room:error'), 'No error for bot target');

  sender.ws.close();
  target.ws.close();
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
