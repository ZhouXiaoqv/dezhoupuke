const assert = require('node:assert/strict');
const { launchBrowser } = require('../support/browser');

async function run() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(process.env.POKER_TEST_URL);
    await page.waitForFunction(() => !!window.Pets3D);
    await page.evaluate(() => enterLayoutTestRoom());
    await page.evaluate(() => {
      const state = buildLayoutTestState();
      state.phase = 'idle';
      state.winners = [{ id: state.players[0].id, hand: '其他人弃牌', revealedRank: '同花' }];
      renderGame(state);
      showNextHandBar(15);
    });
    assert.equal(await page.$eval('.revealed-rank', el => el.textContent), '🏆 同花');
    await page.evaluate(() => { hideNextHandBar(); renderGame(buildLayoutTestState()); });
    assert.equal(await page.$('.revealed-rank'), null);
    const rails = await page.evaluate(() => {
      SFX.toggle();
      const fire = (action, raiseBy) => {
        handleActionLog({ action, raiseBy, playerId: gameState.players[0].id });
        return document.querySelector('.rail-effect')?.classList[1] || '';
      };
      return [fire('raise', 499), fire('raise', 500), fire('allinCall', 1),
        fire('allinRaise', 600), fire('allin', 1), document.querySelectorAll('.rail-effect').length];
    });
    assert.deepEqual(rails, ['', 'rail-raise', 'rail-allin', 'rail-allin', 'rail-allin', 1]);
    await page.click('#previewRaise');
    assert.ok(await page.$('.rail-raise'));
    await page.click('#previewAllIn');
    assert.ok(await page.$('.rail-allin'));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await page.evaluate(() => {
      playTableLights(gameState.players[0].id, true);
      return document.querySelector('.rail-effect').children.length;
    }), 1);
    await page.emulateMediaFeatures([]);
    const cards = await page.evaluate(() => {
      const board = document.getElementById('community');
      const dot = document.getElementById("connDot");
      const original = [...board.children];
      const state = buildLayoutTestState();
      state.players[0].publicProfile.charm++;
      renderGame(state);
      const retained = original.every((el, index) => board.children[index] === el);
      state.community.pop();
      renderGame(state);
      const turn = [...board.children];
      state.community = buildLayoutTestState().community;
      renderGame(state);
      return { connectionDot: !!dot && dot === document.getElementById("connDot"), retained, river: turn.slice(0, 4).every((el, i) => board.children[i] === el)
        && board.lastChild !== turn[4] && board.lastChild.classList.contains('card-flip-in') };
    });
    assert.deepEqual(cards, { connectionDot: true, retained: true, river: true });
    // Project the same GLB models and seat coordinates used by the live overlay.
    const petBounds = await page.evaluateHandle(async () => {
      const { PetStage3D } = await import('/js/pets3d.js');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const THREE = await import('three');
      const stage = new PetStage3D();
      stage.loader = new GLTFLoader();
      stage.scene = new THREE.Scene();
      stage.table = document.getElementById('table');
      stage.stage = document.getElementById('table-container');
      const state = buildLayoutTestState();
      const players = [0, 6];
      for (const index of players) {
        const instance = await stage.ensureInstance(state.players[index], stage.syncVersion);
        if (!instance) throw Error('Missing seat pet ' + index);
      }
      return () => players.map(index => {
        const player = state.players[index];
        stage.positionInstance(player, index);
        const box = new THREE.Box3().setFromObject(stage.instances.get(player.id).model);
        const rect = stage.stage.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        return { left: x + box.min.x, right: x + box.max.x, top: y - box.max.y, bottom: y - box.min.y };
      });
    });
    for (const [width, height] of [[360, 780], [390, 844], [844, 390], [1280, 800]]) {
      await page.setViewport({ width, height });
      const layout = await page.evaluate(async getPetBounds => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        // Measure resting positions after the deal and flip animations settle.
        const animations = document.getElementById('table').getAnimations({ subtree: true });
        await Promise.allSettled(animations.filter(animation =>
          Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished));
        const bets = [...document.querySelectorAll('.seat-bet')];
        const blockers = [...document.querySelectorAll('.seat-info,.seat-cards .card,.community .card,.pot-display')];
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { petCollision: getPetBounds().some(rect => bets.some(bet => overlaps(rect, bet.getBoundingClientRect()))),
          count: bets.length, collision: bets.some((bet, i) =>
          [...blockers, ...bets.slice(i + 1)].some(el => overlaps(bet.getBoundingClientRect(), el.getBoundingClientRect()))) };
      }, petBounds);
      assert.deepEqual(layout, { count: 8, collision: false, petCollision: false }, 'Seat layout at ' + width);
    }
    const pets = await page.evaluate(async () => {
      const { PetStage3D } = await import('/js/pets3d.js');
      const THREE = await import('three');
      const stage = new PetStage3D();
      stage.scene = new THREE.Scene();
      stage.ensure = () => true;
      stage.start = () => {};
      let finishLoad;
      const pending = new Promise(resolve => { finishLoad = resolve; });
      stage.loadPet = () => pending;
      const state = { players: [{ id: 'test', pet: 'cat' }] };
      const updates = [stage.sync(state), stage.sync(state)];
      finishLoad({ scene: new THREE.Group(), animations: [] });
      await Promise.all(updates);
      const loaded = stage.scene.children.length;
      const stale = stage.sync({ players: [{ id: 'test', pet: 'dog' }] });
      stage.clear();
      await stale;
      return [loaded, stage.scene.children.length, stage.instances.size];
    });
    assert.deepEqual(pets, [1, 0, 0]);
    console.log('PASS community cards, seat bets at four viewport sizes, overlapping and cancelled pet loads');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
