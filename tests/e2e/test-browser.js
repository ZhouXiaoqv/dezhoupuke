const fs = require('fs');
const path = require('path');

const { launchBrowser, startTwoPlayerHand } = require('../support/browser');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function ss(page, name) {
  const fp = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: false });
  console.log(`  📸 ${name}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error));

    // === 1. Load page ===
    console.log('1. Loading page...');
    await startTwoPlayerHand(browser, page);
    // === 6. Check seats ===
    console.log('6. Checking seats...');
    const seats = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.seat')).map((s, i) => ({
        i, cls: s.className, pid: s.dataset.playerId,
        info: !!s.querySelector('.seat-info'),
        cards: !!(s.querySelector('.seat-cards') || s.querySelector('.my-hand')),
        interact: !!s.querySelector('.interact-trigger'),
        x: Math.round(s.getBoundingClientRect().x),
        y: Math.round(s.getBoundingClientRect().y),
      }));
    });
    console.log(`  Found ${seats.length} seats`);
    seats.forEach(s => console.log(`  Seat ${s.i}: pid=${s.pid} info=${s.info} cards=${s.cards} interact=${s.interact} pos=(${s.x},${s.y})`));

    if (seats.length === 0) {
      console.log('  No seats. Checking page state...');
      const state = await page.evaluate(() => {
        const scr = document.querySelector('.screen.active');
        const table = document.getElementById('gameTable');
        return {
          activeScreen: scr ? scr.id : 'none',
          tableExists: !!table,
          tableChildren: table ? table.children.length : 0,
          allBtns: Array.from(document.querySelectorAll('button'))
            .map(b => b.textContent.trim()).filter(t => t.length > 0 && t.length < 20),
        };
      });
      console.log('  State:', JSON.stringify(state, null, 2));
    }

    // === 7. Flicker test ===
    if (seats.length > 0) {
      console.log('7. Flicker test (10s, 500ms interval)...');
      let prevIds = null, stable = 0, changed = 0;
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const ids = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.seat')).map(s => s.dataset.playerId)
        );
        if (prevIds) {
          JSON.stringify(ids) === JSON.stringify(prevIds) ? stable++ : changed++;
        }
        prevIds = ids;
      }
      console.log(`  Stable: ${stable}, Changed: ${changed}`);
      console.log(changed === 0 ? '  ✅ No flickering!' : '  ⚠ Seats changed!');
    }

    // === 8. Play a few rounds ===
    console.log('8. Playing game...');
    for (let round = 0; round < 8; round++) {
      const act = await page.evaluate(() => {
        const p = document.getElementById('actionPanel');
        if (p && p.classList.contains('active')) {
          const btns = p.querySelectorAll('.action-btn');
          for (const b of btns) {
            if (b.textContent.includes('弃牌')) { b.click(); return 'fold'; }
            if (b.textContent.includes('过牌')) { b.click(); return 'check'; }
            if (b.textContent.includes('跟注')) { b.click(); return 'call'; }
          }
        }
        return 'waiting';
      });
      console.log(`  Round ${round}: ${act}`);
      await sleep(3000);
      if (act !== 'waiting') await ss(page, `08-${act}-${round}`);
    }
    await ss(page, '09-final');

    // === 9. Test emoji interact ===
    if (seats.length > 0) {
      console.log('9. Testing emoji interact...');
      const interactResult = await page.evaluate(() => {
        const trig = document.querySelector('.interact-trigger');
        if (trig) { trig.click(); return 'clicked'; }
        return 'not found';
      });
      console.log('  → ' + interactResult);
      await sleep(1000);
      const panel = await page.evaluate(() => {
        const p = document.getElementById('interactPanel');
        if (p && p.classList.contains('active')) {
          const r = p.getBoundingClientRect();
          return { visible: true, x: Math.round(r.x), y: Math.round(r.y) };
        }
        return { visible: false };
      });
      console.log('  Panel:', JSON.stringify(panel));
      await ss(page, '10-interact');
    }

    if (errors.length) throw errors[0];
    console.log('\n✅ Test complete!');

  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
