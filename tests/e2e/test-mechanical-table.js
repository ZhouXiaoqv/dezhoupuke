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
  assert.deepEqual(result.registered, ['deal', 'reveal', 'receipt', 'fold']);
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
      const sleeves = [...svg.querySelectorAll('[data-arm-sleeve]')].sort((a, b) =>
        Number(a.dataset.armSleeve) - Number(b.dataset.armSleeve)
      ).map(node => {
        const transform = node.transform.baseVal;
        return transform.numberOfItems ? transform.getItem(0).matrix.e : 0;
      });
      const geometry = [...svg.querySelectorAll('.arm-segment :is(rect,path)')].map(part =>
        ['x', 'y', 'width', 'height', 'd'].map(attribute => part.getAttribute(attribute)));
      const rails = [...svg.querySelectorAll('.arm-parallel-link')].map(rail => {
        const transform = rail.transform.baseVal;
        const { e: x, f: y } = transform.getItem(0).matrix;
        return { x, y, angle: transform.getItem(1).angle };
      });
      const angle = selector => svg.querySelector(selector).transform.baseVal.getItem(0).angle;
      return {
        sleeves, geometry, rails,
        ratio: angle('.arm-bearing-rotor') - angle('.arm-bearing-dial'),
      };
    };
    motion.reset({ park: true });
    const folded = gather();
    motion.slideTo(100, 125, 0);
    motion.move({ x: 1680, y: 410, angle: 65 }, { duration: 300, wristAngle: 0 }, 0);
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
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return { folded, extended, reached: reached.pose.angle, slide: reached.offset, feeding,
      lengths: [distance(reached.joints[0], reached.joints[1]), distance(reached.joints[1], reached.joints[2]),
        distance(reached.joints[2], reached.joints[3])],
      grasped, stroke, released, parked: Number(gripper.dataset.aperture), retracted: Number(pin.dataset.stroke) };
  });
  assert.deepEqual(result.folded.sleeves, [0, -28, -31]);
  assert.deepEqual(result.extended.sleeves.map(Math.round), [0, 122, 272]);
  assert.deepEqual(result.extended.geometry, result.folded.geometry);
  assert.deepEqual(result.lengths.map(Math.round), [443, 76, 28]);
  for (const { rails } of [result.folded, result.extended]) {
    assert.ok(Math.abs(rails[0].angle - rails[1].angle) < .001);
    assert.ok(Math.abs(Math.hypot(rails[0].x - rails[1].x, rails[0].y - rails[1].y) - 26) < .001);
  }
  assert.notEqual(result.folded.ratio, result.extended.ratio);
  assert.equal(result.reached, 0);
  assert.equal(result.slide, 91);
  assert.deepEqual(result.feeding, ['open', 'true', 80]);
  assert.deepEqual([result.grasped, result.released, result.parked], [15, 100, 30]);
  assert.deepEqual([result.stroke, result.retracted], [3, 0]);
}

async function verifySeatClamps(browser) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.goto(process.env.POKER_TEST_URL);
    await page.evaluate(() => {
      const state = buildLayoutTestState();
      Object.assign(state, { tableStyle: 'mechanical', currentIdx: 0, dealerIdx: 0, sbIdx: 0, bbIdx: 5 });
      Net.playerId = state.players[0].id;
      isLayoutTestRoom = true;
      state.players[0].hand = [makeLayoutTestCard('A', 1), makeLayoutTestCard('8', 2)];
      state.players[1].lastAction = 'check';
      Object.assign(state.players[3], { allIn: true, lastAction: 'allin' });
      Object.assign(state.players[6], { folded: true, lastAction: 'fold' });
      showScreen('table');
      renderGame(state);
      restoreActionPanelIfMyTurn();
    });
    for (const [width, height] of [[1280, 900], [1024, 768]]) {
      await page.setViewport({ width, height });
      const layout = await page.evaluate(() => {
        const rect = node => node.getBoundingClientRect();
        const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 &&
          a.top < b.bottom - 1 && a.bottom > b.top + 1;
        const seats = [...document.querySelectorAll('#table .seat')];
        const board = rect(document.getElementById('community'));
        const boxes = [];
        const measurements = seats.map(seat => {
          const find = selector => seat.querySelector(selector);
          const card = find(':is(.my-hand,.seat-cards):has(.card)');
          const body = rect(find('.mechanical-seat-body'));
          const tongue = rect(find('.mechanical-seat-tongue'));
          const avatar = rect(find('.mechanical-seat-avatar'));
          const plate = rect(find('.mechanical-seat-plate'));
          const edge = seat.dataset.mechanicalEdge;
          const hand = card && rect(card);
          const distance = !hand ? 0 : {
            top: hand.top - tongue.bottom, bottom: tongue.top - hand.bottom,
            left: hand.left - tongue.right, right: tongue.left - hand.right,
          }[edge];
          boxes.push([body, hand].filter(Boolean));
          const name = rect(find('.seat-name'));
          return {
            edge,
            connected: !hand || (Math.abs(distance) <= 3 && !overlaps(hand, body)),
            inView: body.left >= 0 && body.right <= innerWidth && body.top >= 0 && body.bottom <= innerHeight,
            touchesBoard: hand && overlaps(hand, board),
            stacked: avatar.width < plate.width && avatar.top < plate.top && avatar.bottom > plate.top,
            fasteners: seat.querySelectorAll('.mechanical-seat-fasteners i').length,
            reels: seat.querySelectorAll('.mechanical-seat-plate .mechanical-reel').length,
            roles: [...seat.querySelectorAll('.mechanical-seat-role[data-lit]')].map(role => role.textContent),
            roleWindows: seat.querySelectorAll('.mechanical-seat-role').length,
            clearName: name.top > avatar.bottom,
            statusRemoved: !find('.seat-action'),
            lamp: getComputedStyle(find('.mechanical-seat-lamp')).animationName,
            finish: getComputedStyle(find('.seat-info')).filter,
          };
        });
        const collision = boxes.some((rects, index) => boxes.slice(index + 1)
          .some(other => rects.some(a => other.some(b => overlaps(a, b)))));
        const cardBoxes = [board, ...boxes.map(([, hand]) => hand).filter(Boolean)];
        const labelsClear = [...document.querySelectorAll('#mechanicalChipLabels [data-amount]')]
          .every(label => !cardBoxes.some(card => overlaps(card, rect(label))));
        return { measurements, collision, labelsClear };
      });
      const { measurements, collision, labelsClear } = layout;
      const details = JSON.stringify({ width, ...layout });
      assert.deepEqual([...new Set(measurements.map(seat => seat.edge))].sort(), ['bottom', 'left', 'right', 'top']);
      assert.equal(collision, false, details);
      assert.ok(labelsClear, details);
      assert.ok(measurements.every(seat => seat.connected && seat.inView && !seat.touchesBoard &&
        seat.stacked && seat.fasteners === 4 && seat.reels === 5 && seat.roleWindows === 3 &&
        seat.clearName && seat.statusRemoved), details);
      assert.deepEqual(measurements[0].roles, ['D', 'SB']);
      assert.deepEqual(measurements[5].roles, ['BB']);
      assert.equal(measurements[0].lamp, 'mechanicalSeatBreathing');
      assert.equal(measurements[6].lamp, 'none');
      assert.match(measurements[6].finish, /saturate/);
    }
  } finally {
    await context.close();
  }
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
      const feed = document.getElementById('mechanicalBayCards');
      const recycler = document.getElementById('mechanicalRecycledCards');
      const fed = new WeakSet(), carried = new WeakSet();
      window.armDealTrace = [];
      window.armFoldTrace = [];
      window.consolePhaseTrace = [];
      const observer = new MutationObserver(records => {
        for (const { target, attributeName, addedNodes } of records) {
          if (attributeName === 'data-hatch' && target.dataset.hatch === 'open') window.armDealTrace.push('open');
          if (target === feed) for (const node of addedNodes) {
            if (node.dataset?.armMount === 'staged') {
              fed.add(node);
              window.armDealTrace.push('feed');
            }
          }
          if (target === payloads) for (const node of addedNodes) {
            if (node.dataset?.armMount !== 'carried' || !node.classList.contains('card')) continue;
            carried.add(node);
            if (node.classList.contains('mechanical-fold-card')) window.armFoldTrace.push('grip');
            else window.armDealTrace.push(fed.has(node) ? 'grip' : 'unfed');
          }
          if (attributeName === 'data-arm-flight' && target.dataset.armFlight === 'place') {
            window.armDealTrace.push(carried.has(target) ? 'place' : 'ungripped');
          }
          if (attributeName === 'data-arm-flight' && target.dataset.armFlight === 'recycle') {
            window.armFoldTrace.push(carried.has(target) ? 'recycle' : 'ungripped');
            window.dealTraceAtRecycle = window.armDealTrace.slice();
          }
        }
      });
      observer.observe(base, { attributeFilter: ['data-hatch'] });
      observer.observe(feed, { childList: true });
      observer.observe(recycler, { subtree: true, attributeFilter: ['data-arm-flight'] });
      observer.observe(payloads, { subtree: true, childList: true, attributeFilter: ['data-arm-flight'] });
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
        window.openingReels = [...document.querySelectorAll('#table .seat[data-player-id] .mechanical-reels')].map(el => ({
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
        seats: [...document.querySelectorAll('#table .seat[data-player-id]')].sort((a, b) =>
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
    const dealt = count => Array.from({ length: count }, () => ['open', 'feed', 'grip', 'place']).flat();
    assert.deepEqual(await host.evaluate(() => window.armDealTrace), dealt(6));
    const opening = await host.evaluate(() => window.openingReels);
    assert.equal(opening.length, 3);
    assert.ok(opening.every(counter => counter.digits === 5 && counter.windows));
    assert.equal(opening.filter(counter => counter.direction === 'down').length, 2);
    await host.waitForSelector('#mechanicalArm[data-arm-state="idle"]');
    const consoleState = await host.evaluate(() => {
      const arm = document.getElementById('mechanicalArm');
      const base = document.getElementById('mechanicalBase');
      const cradle = base.querySelector('.mechanical-dock-slot').getBoundingClientRect();
      const wristSaddle = base.querySelector('.mechanical-dock-wrist').getBoundingClientRect();
      const shell = base.querySelector('.mechanical-base-shell').getBoundingClientRect();
      const gripper = arm.querySelector('.arm-gripper');
      const center = element => {
        const { e: x, f: y } = element.transform.baseVal.getItem(0).matrix;
        return { x, y };
      };
      const [shoulder, elbow, wrist] = [...arm.querySelectorAll('.arm-hinge')].map(center);
      const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const upper = angle(shoulder, elbow);
      const bend = MechanicalArmMotion.angleDelta(upper, angle(elbow, wrist));
      const inside = (part, boundary) => part.left >= boundary.left && part.top >= boundary.top &&
        part.right <= boundary.right && part.bottom <= boundary.bottom;
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
      const clear = ['.mechanical-instruments', '.mechanical-bay-opening', '.mechanical-recycle-slot', '.mechanical-lamp-glass']
        .every(selector => exposed(base.querySelector(selector)));
      arm.style.removeProperty('pointer-events');
      const jaws = [...gripper.querySelectorAll('.arm-jaw')].map(jaw => jaw.getBoundingClientRect());
      const raisedSleeve = arm.querySelector('.arm-raised-sleeve');
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
        halfFold: shoulder.x > elbow.x && elbow.x < wrist.x && upper >= 155 && upper <= 160 && bend >= -137 && bend <= -133,
        contained: [...arm.querySelectorAll('[data-arm-sleeve], .arm-forearm, .arm-wrist, .arm-hinge, .arm-gripper')]
          .every(part => inside(part.getBoundingClientRect(), shell)),
        docked: inside(arm.querySelectorAll('.arm-hinge')[2].getBoundingClientRect(), wristSaddle) &&
          jaws.every(jaw => jaw.right > cradle.left && jaw.right < cradle.right &&
          jaw.top + jaw.height / 2 >= cradle.top && jaw.top + jaw.height / 2 <= cradle.bottom),
        aperture: Number(gripper.dataset.aperture),
        stage: base.dataset.armStage,
        layered: z('mechanicalBase') < z('mechanicalArmShadow') && z('mechanicalArmShadow') < z('mechanicalArm') &&
          raisedSleeve.previousElementSibling?.classList.contains('arm-forearm') &&
          getComputedStyle(raisedSleeve).filter.includes('drop-shadow'),
      };
    });
    assert.ok(consoleState.statusHidden && !consoleState.hasFloatingBlinds);
    assert.equal(consoleState.handDigits, String(consoleState.handNum).padStart(3, '0'));
    assert.equal(consoleState.phase, '翻牌前');
    assert.equal(consoleState.blinds, consoleState.expectedBlinds);
    assert.ok(consoleState.clear && consoleState.halfFold && consoleState.contained && consoleState.docked &&
      consoleState.layered, JSON.stringify(consoleState));
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
    await host.waitForFunction(() => window.armFoldTrace.length === 4);
    assert.deepEqual(await host.evaluate(() => window.armFoldTrace), ['grip', 'recycle', 'grip', 'recycle']);
    assert.deepEqual(await host.evaluate(() => window.dealTraceAtRecycle), dealt(6));
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
      collected: Number(document.getElementById('mechanicalPotMeter').dataset.amount),
      inventory: document.getElementById('mechanicalPotMeter').title,
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
    const potCount = [...showdown.inventory.matchAll(/× ([\d,]+)/g)]
      .reduce((total, [, count]) => total + Number(count.replaceAll(',', '')), 0);
    assert.equal(chips, Math.min(108, potCount));
    await host.waitForSelector('#table .seat.winner .mechanical-reels[data-rolling="up"]');
    await host.waitForFunction(() => [...document.querySelectorAll('.seat.winner .mechanical-seat-body')]
      .some(body => body.getAnimations().some(animation =>
        animation.effect.getKeyframes().some(frame => frame.transform === 'scale(1.05)'))));
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
      total: document.querySelector('#mechanicalResult .mechanical-receipt-pot').textContent,
      rows: document.querySelectorAll('#mechanicalResult .mechanical-result-players li').length,
      cards: document.querySelectorAll('#mechanicalResult .mechanical-result-board .card').length,
      exposedHands: document.querySelectorAll('#mechanicalResult .mechanical-result-players .card-front').length,
      winner: document.querySelector('.mechanical-result-winner')?.textContent,
    }));
    assert.equal(receipt.total, '总底池 ' + showdown.total);
    assert.equal(receipt.rows, 3);
    assert.equal(receipt.cards, 5);
    assert.equal(receipt.exposedHands, 4);
    assert.ok(receipt.winner?.includes('+'));
    await host.waitForFunction(() => !document.querySelector('#community .mechanical-pending'));
    assert.deepEqual(await host.evaluate(() => window.armDealTrace), dealt(11));
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
    await verifySeatClamps(browser);
    console.log('PASS mechanical table seats, console, arm parking, wagers, reels, payout flight and settlement');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
