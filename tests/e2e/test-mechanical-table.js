const assert = require('node:assert/strict');
const { launchBrowser } = require('../support/browser');

async function register(page, username) {
  await page.goto(process.env.POKER_TEST_URL);
  await page.waitForFunction(() => Net.connected);
  await page.evaluate(name => Net.send('user:register', { username: name, password: 'test123' }), username);
  await page.waitForFunction(() => isRegistered);
  await page.evaluate(() => {
    document.getElementById('checkinClose').click();
    const play = turn => Net.send('game:action', { action: turn.toCall ? 'call' : 'check' });
    Net.on('game:yourTurn', turn => {
      if (window.playMechanical) play(turn);
      else window.mechanicalTurn = turn;
    });
    window.resumeMechanical = () => {
      window.playMechanical = true;
      if (window.mechanicalTurn && isMyTurnState()) play(window.mechanicalTurn);
      window.mechanicalTurn = null;
    };
  });
}

async function nextActor(pages) {
  return Promise.any(pages.map(async page => {
    await page.waitForFunction(() => window.mechanicalTurn && isMyTurnState(), { timeout: 12000 });
    return page;
  }));
}

async function sendAction(page, action, amount) {
  await page.evaluate(({ action, amount }) => {
    window.mechanicalTurn = null;
    Net.send('game:action', { action, amount });
  }, { action, amount });
}

async function verifyArmController(page) {
  const result = await page.evaluate(() => {
    const origin = { x: 240, y: 22 };
    const home = { x: 312, y: 40, angle: 24, lift: 0 };
    const states = new Set();
    const motion = MechanicalArmMotion.create({ draw: frame => states.add(frame.state) });
    motion.resize(origin);
    const folded = motion.reset(home);
    motion.move({ x: 430, y: 280, angle: 80, lift: 30 }, { duration: 300, easing: [0.16, 1, 0.3, 1] }, 0);
    const following = motion.tick(50);
    const before = motion.tick(144);
    motion.move({ x: 480, y: 180, angle: 0, lift: 10 }, { duration: 200 }, 144);
    const after = motion.tick(144);
    const synchronous = JSON.stringify(before.joints) === JSON.stringify(after.joints);
    const settled = motion.tick(410).pose;

    const layer = document.createElement('div');
    const payload = document.createElement('i');
    const lifecycle = [];
    const arm = createMechanicalArmActions({
      rig: { motion, hardware: ({ hatch } = {}) => { if (hatch) lifecycle.push('open'); } },
      layer, presets: { gift: MechanicalArmPresets.giftExample },
      home: () => home, bay: () => ({ x: 240, y: 43, angle: 0, lift: 4 }),
    });
    arm.enqueue('gift', {
      target: { x: 420, y: 225 }, payload,
      onGrab: () => lifecycle.push('grab'),
      onCarry: () => { if (!lifecycle.includes('carry')) lifecycle.push('carry'); },
      onRelease: event => { lifecycle.push(event.mode); },
      onLand: () => lifecycle.push('land'),
    });
    let flew = false;
    for (let time = 0; time <= 2300; time += 16) {
      arm.tick(time);
      flew ||= payload.parentElement === layer && payload.dataset.armFlight === 'drop';
    }
    return {
      wristWaited: following.pose.x === home.x && following.pose.y === home.y,
      elbowFollowed: JSON.stringify(folded.joints[1]) !== JSON.stringify(following.joints[1]),
      synchronous, settled, lifecycle, flew, empty: !layer.childElementCount, states: [...states],
      registered: Object.keys(MechanicalArmPresets.active),
    };
  });
  assert.ok(result.wristWaited && result.elbowFollowed && result.synchronous);
  assert.deepEqual(result.settled, { x: 480, y: 180, angle: 0, lift: 10 });
  assert.deepEqual(result.lifecycle, ['open', 'grab', 'carry', 'drop', 'land']);
  assert.ok(result.flew && result.empty);
  assert.deepEqual(result.states.sort(), ['holding', 'idle', 'moving', 'returning']);
  assert.deepEqual(result.registered, ['deal', 'reveal', 'fold']);
}

async function run() {
  const browser = await launchBrowser();
  try {
    const host = await browser.newPage();
    const guest = await (await browser.createBrowserContext()).newPage();
    const suffix = Date.now().toString(36);
    await Promise.all([register(host, 'mh' + suffix), register(guest, 'mg' + suffix)]);
    await verifyArmController(host);
    await host.click('#cardCreate');
    await host.click('input[name="tableStyle"][value="mechanical"]');
    await host.click('#createRoomBtn');
    await host.waitForSelector('#roomScreen.active');
    const code = await host.evaluate(() => roomCode);
    await guest.evaluate(code => Net.send('room:join', { code }), code);
    await guest.waitForSelector('#roomScreen.active');
    await host.evaluate(() => Net.send('room:addBot'));
    await host.waitForFunction(() => document.querySelectorAll('#roomPlayers .room-player-card').length === 3);
    assert.equal(await guest.evaluate(() => MechanicalTable.enabled()), true);
    const rejected = await guest.evaluate(() => new Promise(resolve => {
      Net.once('room:error', data => resolve(data.message));
      Net.send('room:interact', { targetId: 'any', emotionId: 'laugh' });
    }));
    assert.match(rejected, /机械牌桌.*表情/);

    await host.evaluate(() => {
      const base = document.getElementById('mechanicalBase');
      const payloads = document.getElementById('mechanicalMovingCards');
      window.armDealTrace = { opens: 0, slides: 0 };
      const observer = new MutationObserver(records => {
        for (const { target, attributeName } of records) {
          if (attributeName === 'data-hatch' && target.dataset.hatch === 'open') window.armDealTrace.opens++;
          if (attributeName === 'data-arm-flight' && target.dataset.armFlight === 'slide') window.armDealTrace.slides++;
        }
      });
      observer.observe(base, { attributeFilter: ['data-hatch'] });
      observer.observe(payloads, { subtree: true, attributeFilter: ['data-arm-flight'] });
    });
    await host.click('#startGameBtn');
    for (const page of [host, guest]) {
      await page.waitForSelector('#table-container.active.mechanical-table .seat[data-mechanical-slot="0"]');
      const table = await page.evaluate(() => ({
        localId: Net.playerId,
        order: gameState.players.map(player => player.id),
        seats: [...document.querySelectorAll('#table .seat')].sort((a, b) =>
          Number(a.dataset.mechanicalSlot) - Number(b.dataset.mechanicalSlot)
        ).map(node => node.dataset.playerId),
        outfit: document.getElementById('tableOutfitBtn').hidden,
        interactions: document.querySelectorAll('#table .interact-trigger').length,
        backs: document.querySelectorAll('#table .mechanical-card-back:not([data-card-back])').length,
      }));
      const self = table.order.indexOf(table.localId);
      assert.deepEqual(table.seats, [...table.order.slice(self), ...table.order.slice(0, self)]);
      assert.equal(table.outfit, true);
      assert.equal(table.interactions, 0);
      assert.ok(table.backs >= 4);
      await page.waitForFunction(() => !document.querySelector('.mechanical-pending'));
    }
    assert.deepEqual(await host.evaluate(() => window.armDealTrace), { opens: 1, slides: 6 });

    let raiser = await nextActor([host, guest]);
    if (await raiser.evaluate(() => gameState.players.find(player => player.id === Net.playerId).bet === 0)) {
      await sendAction(raiser, 'call');
      raiser = await nextActor([host, guest]);
    }
    await raiser.waitForFunction(() => {
      const seat = document.querySelector('#table .seat[data-mechanical-slot="0"] .seat-info');
      const actions = document.getElementById('actionPanel');
      return actions.classList.contains('active') &&
        seat.getBoundingClientRect().bottom + 8 <= actions.getBoundingClientRect().top;
    }, { timeout: 4000 });
    await sendAction(raiser, 'raise', 57);
    await host.waitForSelector('#mechanicalChipLabels [data-amount="57"]');
    const inventory = await host.$eval('#mechanicalChipLabels [data-amount="57"]', node => node.title);
    assert.equal(inventory, '20 × 2 · 10 × 1 · 5 × 1 · 1 × 2');
    await raiser.waitForFunction(() => {
      const wager = document.querySelector('#mechanicalChipLabels [data-amount="57"]');
      const hand = document.querySelector('#table .my-hand');
      return wager && hand && wager.getBoundingClientRect().right < hand.getBoundingClientRect().left;
    }, { timeout: 4000 });

    const folder = await nextActor([host, guest]);
    const folderId = await folder.evaluate(() => Net.playerId);
    await sendAction(folder, 'fold');
    await host.waitForSelector('.mechanical-spark');
    await host.waitForFunction(id => gameState.players.find(player => player.id === id)?.folded, {}, folderId);

    await Promise.all([host, guest].map(page => page.evaluate(() => window.resumeMechanical())));
    await host.waitForFunction(() => gameState?.phase === 'showdown' && gameState.community.length === 5);
    const showdown = await host.evaluate(() => ({
      total: gameState.pot,
      collected: Number(document.querySelector('#mechanicalChipLabels [data-amount]')?.dataset.amount),
      inventory: document.querySelector('#mechanicalChipLabels [data-amount]')?.title,
      cards: document.querySelectorAll('#community .card-front').length,
      revealed: gameState.players.filter(player => !player.folded && player.hand.every(Boolean)).length,
    }));
    assert.equal(showdown.total, showdown.collected);
    assert.ok(showdown.total >= 100);
    assert.doesNotMatch(showdown.inventory, /100 ×/);
    assert.match(showdown.inventory, /1 × [4-9]/);
    assert.equal(showdown.cards, 5);
    assert.equal(showdown.revealed, 2);

    await host.waitForSelector('#mechanicalResult', { visible: true });
    const receipt = await host.evaluate(() => ({
      total: document.getElementById('mechanicalResultPot').textContent,
      rows: document.querySelectorAll('#mechanicalResultPlayers li').length,
      cards: document.querySelectorAll('#mechanicalResultBoard .card').length,
      exposedHands: document.querySelectorAll('#mechanicalResultPlayers .card-front').length,
      winner: document.querySelector('.mechanical-result-winner')?.textContent,
    }));
    assert.equal(receipt.total, '底池 ' + showdown.total);
    assert.equal(receipt.rows, 3);
    assert.equal(receipt.cards, 5);
    assert.equal(receipt.exposedHands, 4);
    assert.ok(receipt.winner?.includes('+'));
    console.log('PASS mechanical room rotates each view, renders exact wagers, folds, showdown and settlement');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
