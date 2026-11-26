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
      wristWaited: following.pose.angle === folded.pose.angle,
      elbowFollowed: JSON.stringify(folded.joints[1]) !== JSON.stringify(following.joints[1]),
      synchronous, settled, lifecycle, flew, empty: !layer.childElementCount, states: [...states],
      registered: Object.keys(MechanicalArmPresets.active),
    };
  });
  assert.ok(result.wristWaited && result.elbowFollowed && result.synchronous);
  for (const [key, value] of Object.entries({ x: 480, y: 180, angle: 0, lift: 10 })) {
    assert.ok(Math.abs(result.settled[key] - value) < .001);
  }
  assert.deepEqual(result.lifecycle, ['open', 'grab', 'carry', 'drop', 'land']);
  assert.ok(result.flew && result.empty);
  assert.deepEqual(result.states.sort(), ['holding', 'idle', 'moving', 'returning']);
  assert.deepEqual(result.registered, ['deal', 'reveal', 'fold']);
}

async function verifyJointLimits(page) {
  const result = await page.evaluate(() => {
    const motion = MechanicalArmMotion.create();
    const root = { x: 600, y: -20 };
    const turn = MechanicalArmMotion.angleDelta;
    const heading = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const bay = { x: 480, y: 43, angle: 0 };
    motion.resize(root);
    motion.reset({ park: true });
    const commands = [bay, { x: 730, y: 118, angle: 179 }, { x: 480, y: 43, angle: -179 },
      { x: 235, y: 156, angle: 138 }, { x: 600, y: 12, angle: 90 }, bay, { park: true }];
    const foldedAngles = [];
    const errors = [];
    let previous, maxShoulderStep = 0, maxWrapStep = 0;
    for (const [index, target] of commands.entries()) {
      const time = index * 400;
      motion.slideTo(index % 2 ? -12 : 12, 125, time);
      motion.move(target, { duration: 300, easing: [0.4, 0, 0.2, 1], state: target.park ? 'returning' : 'moving' }, time);
      for (let at = time; at < time + 400; at += 8) {
        const frame = motion.tick(at);
        const [shoulder, elbow, wrist] = frame.joints;
        const upper = heading(shoulder, elbow);
        foldedAngles.push(turn(upper, heading(elbow, wrist)));
        if (previous) {
          maxShoulderStep = Math.max(maxShoulderStep, Math.abs(turn(previous.upper, upper)));
          if (index === 2) maxWrapStep = Math.max(maxWrapStep, Math.abs(turn(previous.angle, frame.pose.angle)));
        }
        previous = { upper, angle: frame.pose.angle };
      }
      const { pose } = motion.tick(time + 390);
      if (target.y >= 43) errors.push(Math.hypot(target.x - pose.x, target.y - pose.y));
    }
    return { min: Math.min(...foldedAngles), max: Math.max(...foldedAngles), maxShoulderStep, maxWrapStep, errors };
  });
  assert.ok(result.min >= -155.001 && result.max <= -24.999, JSON.stringify(result));
  assert.ok(result.maxShoulderStep < 30 && result.maxWrapStep < 1, JSON.stringify(result));
  assert.ok(result.errors.every(error => error < .001), JSON.stringify(result));
}

async function verifyMovingRig(page) {
  const result = await page.evaluate(() => {
    const element = id => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      node.id = id;
      return node;
    };
    const svg = element('testMovingArm');
    const base = document.getElementById('mechanicalBase').cloneNode(true);
    const rig = createMechanicalArmRig(svg, element('testMovingShadow'), base);
    rig.resize(900, 540);
    const motion = rig.motion;
    const gather = () => {
      const cylinder = svg.querySelector('#testMovingArmHydraulic');
      const rails = [...svg.querySelectorAll('.arm-parallel-link')].map(rail => {
        const transform = rail.transform.baseVal;
        const { e: x, f: y } = transform.getItem(0).matrix;
        return { x, y, angle: transform.getItem(1).angle };
      });
      const angle = selector => svg.querySelector(selector).transform.baseVal.getItem(0).angle;
      return {
        piston: Number(cylinder.children[0].getAttribute('width')),
        barrel: Number(cylinder.children[1].getAttribute('width')),
        rails,
        ratio: angle('.arm-bearing-rotor') - angle('.arm-bearing-dial'),
      };
    };
    motion.reset({ x: 522, y: 40, angle: 24, lift: 0 });
    const folded = gather();
    motion.move({ x: 645, y: 410, angle: 65 }, { duration: 300, wristAngle: 0 }, 0);
    motion.slideTo(100, 125, 0);
    const reached = motion.tick(400);
    const extended = gather();
    const gripper = svg.querySelector('.arm-gripper');
    const pin = svg.querySelector('.arm-ejector');
    rig.hardware({ stage: 'feed', hatch: true, feed: true }, 410);
    motion.tick(490);
    const feeding = [base.dataset.hatch, base.dataset.feeding, Number(gripper.dataset.aperture)];
    rig.hardware({ stage: 'grasp' }, 500);
    motion.tick(550);
    const grasped = Number(gripper.dataset.aperture);
    rig.hardware({ stage: 'release', hatch: false, eject: true }, 560);
    motion.tick(582);
    const stroke = Number(pin.dataset.stroke);
    motion.tick(600);
    const released = Number(gripper.dataset.aperture);
    rig.hardware({ stage: 'returning' }, 650);
    motion.tick(950);
    return { folded, extended, reached: reached.pose.angle, slide: reached.offset, feeding,
      grasped, stroke, released, parked: Number(gripper.dataset.aperture), retracted: Number(pin.dataset.stroke) };
  });
  assert.ok(Math.abs(result.extended.piston - result.folded.piston) > 15);
  assert.equal(result.extended.barrel, result.folded.barrel);
  for (const { rails } of [result.folded, result.extended]) {
    assert.ok(Math.abs(rails[0].angle - rails[1].angle) < .001);
    assert.ok(Math.abs(Math.hypot(rails[0].x - rails[1].x, rails[0].y - rails[1].y) - 26) < .001);
  }
  assert.notEqual(result.folded.ratio, result.extended.ratio);
  assert.equal(result.reached, 0);
  assert.equal(result.slide, 12);
  assert.deepEqual(result.feeding, ['open', 'true', 80]);
  assert.deepEqual([result.grasped, result.released, result.parked], [15, 100, 30]);
  assert.deepEqual([result.stroke, result.retracted], [3, 0]);
}

async function run() {
  const browser = await launchBrowser();
  try {
    const host = await browser.newPage();
    const guest = await (await browser.createBrowserContext()).newPage();
    const suffix = Date.now().toString(36);
    await Promise.all([register(host, 'mh' + suffix), register(guest, 'mg' + suffix)]);
    await verifyArmController(host);
    await verifyJointLimits(host);
    await verifyMovingRig(host);
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
      window.armDealTrace = [];
      window.consolePhaseTrace = [];
      const observer = new MutationObserver(records => {
        for (const { target, attributeName } of records) {
          if (attributeName === 'data-hatch' && target.dataset.hatch === 'open') window.armDealTrace.push('open');
          if (attributeName === 'data-arm-flight' && target.dataset.armFlight === 'slide') window.armDealTrace.push('slide');
        }
      });
      observer.observe(base, { attributeFilter: ['data-hatch'] });
      observer.observe(payloads, { subtree: true, attributeFilter: ['data-arm-flight'] });
      Net.on('game:state', state => {
        const phase = document.getElementById('mechanicalPhaseLabel');
        if (window.consolePhaseTrace.at(-1)?.phase !== state.phase) {
          const steps = phase.getAnimations({ subtree: true }).map(({ effect }) => {
            const { delay, duration } = effect.getTiming();
            return { delay, duration, upper: effect.target.classList.contains('mechanical-flap-upper'),
              onlyFolds: effect.getKeyframes().every(frame => frame.transform.startsWith('scaleY(')) };
          });
          window.consolePhaseTrace.push({ phase: state.phase, label: phase.getAttribute('aria-label'), steps });
        }
        if (window.openingReels || state.phase !== 'preflop') return;
        window.openingReels = [...document.querySelectorAll('#table .seat .mechanical-reels')].map(el => ({
          direction: el.dataset.rolling,
          digits: el.querySelectorAll('.mechanical-reel').length,
          windows: [...el.querySelectorAll('.mechanical-reel')].every(slot => {
            const cell = slot.querySelector('.mechanical-reel-strip > span');
            return slot.clientHeight === cell.clientHeight && getComputedStyle(slot).overflowY === 'hidden';
          }),
        }));
      });
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
    assert.deepEqual(await host.evaluate(() => window.armDealTrace), Array.from({ length: 6 }, () => ['open', 'slide']).flat());
    const opening = await host.evaluate(() => window.openingReels);
    assert.equal(opening.length, 3);
    assert.ok(opening.every(counter => counter.digits === 5 && counter.windows));
    assert.equal(opening.filter(counter => counter.direction === 'down').length, 2);
    await host.waitForSelector('#mechanicalArm[data-arm-state="idle"]');
    const consoleState = await host.evaluate(() => {
      const arm = document.getElementById('mechanicalArm');
      const base = document.getElementById('mechanicalBase');
      const cradle = base.querySelector('.mechanical-park-cradle').getBoundingClientRect();
      const gripper = arm.querySelector('.arm-gripper');
      const center = element => {
        const { e: x, f: y } = element.transform.baseVal.getItem(0).matrix;
        return { x, y };
      };
      const [shoulder, elbow, wrist] = [...arm.querySelectorAll('.arm-hinge')].map(center);
      const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const upper = angle(shoulder, elbow);
      const bend = MechanicalArmMotion.angleDelta(upper, angle(elbow, wrist));
      const exposed = target => {
        const { left, right, top, bottom } = target.getBoundingClientRect();
        for (let x = left + 1; x < right; x += 2) {
          for (let y = top + 1; y < bottom; y += 2) {
            if (document.elementsFromPoint(x, y).some(element => element !== arm && arm.contains(element))) return false;
          }
        }
        return true;
      };
      arm.style.pointerEvents = 'visiblePainted';
      const clear = ['.mechanical-instruments', '.mechanical-bay-opening', '.mechanical-lamp-glass']
        .every(selector => exposed(base.querySelector(selector)));
      arm.style.removeProperty('pointer-events');
      const jaws = [...gripper.querySelectorAll('.arm-jaw')].map(jaw => jaw.getBoundingClientRect());
      const hand = document.getElementById('mechanicalHandReels');
      const z = id => Number(getComputedStyle(document.getElementById(id)).zIndex);
      return {
        statusHidden: getComputedStyle(document.getElementById('statusBar')).display === 'none',
        hasFloatingBlinds: !!document.getElementById('mechanicalBlinds'),
        handDigits: [...hand.querySelectorAll('.mechanical-reel')].map(reel => reel.dataset.digit).join(''),
        handNum: gameState.handNum,
        phase: document.getElementById('mechanicalPhaseLabel').getAttribute('aria-label'),
        blinds: document.getElementById('mechanicalBlindValue').textContent,
        expectedBlinds: `${gameState.sb} / ${gameState.bb}`,
        clear,
        halfFold: shoulder.x > elbow.x && elbow.x < wrist.x && upper >= 145 && upper <= 155 && bend >= -95 && bend <= -75,
        docked: jaws.every(jaw => jaw.right > cradle.left && jaw.right < cradle.right &&
          jaw.top + jaw.height / 2 >= cradle.top && jaw.top + jaw.height / 2 <= cradle.bottom),
        aperture: Number(gripper.dataset.aperture),
        stage: base.dataset.armStage,
        layered: z('mechanicalBase') < z('mechanicalArmShadow') && z('mechanicalArmShadow') < z('mechanicalArm'),
      };
    });
    assert.ok(consoleState.statusHidden && !consoleState.hasFloatingBlinds);
    assert.equal(consoleState.handDigits, String(consoleState.handNum).padStart(3, '0'));
    assert.equal(consoleState.phase, '翻牌前');
    assert.equal(consoleState.blinds, consoleState.expectedBlinds);
    assert.ok(consoleState.clear && consoleState.halfFold && consoleState.docked && consoleState.layered, JSON.stringify(consoleState));
    assert.equal(consoleState.aperture, 30);
    assert.equal(consoleState.stage, 'idle');

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
    await raiser.waitForFunction(() => document.querySelector('[data-mechanical-slot="0"] .mechanical-reels[data-rolling="down"]'),
      { timeout: 4000 });
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
    const phases = await host.evaluate(() => window.consolePhaseTrace);
    for (const [phase, label] of [['flop', '翻牌圈'], ['turn', '转牌圈'], ['river', '河牌圈'], ['showdown', '摊牌']]) {
      assert.deepEqual(phases.find(entry => entry.phase === phase), { phase, label, steps: [
        { delay: 0, duration: 110, upper: true, onlyFolds: true },
        { delay: 110, duration: 110, upper: false, onlyFolds: true },
      ] });
    }
    const showdown = await host.evaluate(() => ({
      total: gameState.pot,
      collected: Number(document.querySelector('#mechanicalChipLabels [data-amount]')?.dataset.amount),
      inventory: document.querySelector('#mechanicalChipLabels [data-amount]')?.title,
      cards: document.querySelectorAll('#community .card-front').length,
      revealed: gameState.players.filter(player => !player.folded && player.hand.every(Boolean)).length,
      waitingForImpact: gameState.winners.every(winner => {
        const seat = [...document.querySelectorAll('#table .seat')].find(seat => seat.dataset.playerId === winner.id);
        const player = gameState.players.find(player => player.id === winner.id);
        return Number(seat.querySelector('.mechanical-reels').dataset.balance) < player.stack;
      }),
    }));
    assert.equal(showdown.total, showdown.collected);
    assert.ok(showdown.total >= 100);
    assert.doesNotMatch(showdown.inventory, /100 ×/);
    assert.match(showdown.inventory, /1 × [4-9]/);
    assert.equal(showdown.cards, 5);
    assert.equal(showdown.revealed, 2);
    assert.ok(showdown.waitingForImpact);
    await host.waitForSelector('#mechanicalPayout[data-chips]');
    const chips = await host.$eval('#mechanicalPayout', el => Number(el.dataset.chips));
    assert.ok(chips >= 12 && chips <= 24);
    await host.waitForSelector('#table .seat.winner .mechanical-reels[data-rolling="up"]');
    await host.waitForFunction(() => !document.getElementById('mechanicalPayout').hasAttribute('data-chips') &&
      gameState.winners.every(winner => {
        const seat = [...document.querySelectorAll('#table .seat')].find(seat => seat.dataset.playerId === winner.id);
        const player = gameState.players.find(player => player.id === winner.id);
        const reel = seat.querySelector('.mechanical-reels');
        const digits = [...reel.querySelectorAll('.mechanical-reel')].map(slot => slot.dataset.digit).join('');
        return !reel.dataset.rolling && Number(digits) === player.stack;
      }));

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
    await host.waitForFunction(() => !document.querySelector('#community .mechanical-pending'));
    assert.deepEqual(await host.evaluate(() => window.armDealTrace), Array.from({ length: 11 }, () => ['open', 'slide']).flat());
    const endedHand = await host.evaluate(() => gameState.handNum);
    await host.evaluate(() => Net.send('game:nextHand'));
    await host.waitForFunction(hand => gameState?.handNum === hand + 1 && gameState.phase === 'preflop', {}, endedHand);
    await host.waitForSelector('#mechanicalHandReels[data-rolling="up"]');
    await host.waitForFunction(hand => {
      const counter = document.getElementById('mechanicalHandReels');
      return !counter.dataset.rolling && [...counter.querySelectorAll('.mechanical-reel')]
        .map(reel => reel.dataset.digit).join('') === String(hand).padStart(3, '0');
    }, {}, endedHand + 1);
    assert.ok(await host.evaluate(() => document.getElementById('mechanicalResult').hidden &&
      !document.getElementById('mechanicalPayout').hasAttribute('data-chips') &&
      gameState.players.every(player => {
        const seat = [...document.querySelectorAll('#table .seat')].find(seat => seat.dataset.playerId === player.id);
        return Number(seat.querySelector('.mechanical-reels').dataset.balance) === player.stack;
      })));
    console.log('PASS mechanical table seats, console, arm parking, wagers, reels, payout flight and settlement');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
