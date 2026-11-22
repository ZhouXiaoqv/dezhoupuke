const assert = require('node:assert/strict');
const { launchBrowser, startTwoPlayerHand } = require('../support/browser');

async function run() {
  const browser = await launchBrowser();
  try {
    const host = await browser.newPage();
    // High-DPI screens catch canvas size mismatches that offset the landing.
    await host.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
    await startTwoPlayerHand(browser, host);
    const guestId = await host.evaluate(() =>
      gameState.players.find((p) => p.id !== Net.playerId).id);

    // The panel lists catalog emotions with their canvas item art.
    await host.evaluate((id) => {
      const seat = document.querySelector(`.seat[data-player-id="${id}"]`);
      showInteractPanel(id, seat);
    }, guestId);
    await host.waitForSelector('#interactPanel.active img.emotion-icon');
    const icons = await host.$$eval('#interactPanel img.emotion-icon', (els) => els.map((el) => el.getAttribute('src')));
    assert.ok(icons.length >= 5 && icons.every((src) => src.endsWith('/icon.svg')), 'Panel shows emotion icons');
    await host.evaluate(() => hideInteractPanel());

    // Every send in a rapid series animates on its own.
    await host.evaluate((id) => {
      for (let i = 0; i < 6; i++) Net.send('room:interact', { targetId: id, emotionId: 'laugh' });
    }, guestId);
    await host.waitForFunction(() => EmotionFx.activeCount() === 6, { timeout: 3000 });
    // Poll until the rAF loop has drawn a frame with visible pixels.
    await host.waitForFunction(() => {
      const canvas = document.querySelector('.emotion-fx-layer');
      if (canvas.hidden) return false;
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 16) if (data[i] > 0) return true;
      return false;
    }, { timeout: 2000 });
    await host.waitForFunction(() => EmotionFx.activeCount() === 0, { timeout: 4000 });
    assert.ok(await host.evaluate(() => document.querySelector('.emotion-fx-layer').hidden), 'Idle canvas is hidden');

    // The impact is drawn on the target's nameplate.
    const landing = await host.evaluate((id) => new Promise((resolve) => {
      spawnEmotionFlyByIds(Net.playerId, id, EMOTION_BY_ID.laugh);
      setTimeout(() => {
        const canvas = document.querySelector('.emotion-fx-layer');
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
        for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
            if (data[(y * canvas.width + x) * 4 + 3] > 40) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x);
              minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
          }
        }
        const plate = document.querySelector(`.seat[data-player-id="${id}"] .seat-info`).getBoundingClientRect();
        const cx = plate.left + plate.width / 2;
        const cy = plate.top + plate.height / 2;
        resolve({
          sized: Math.round(rect.width) === innerWidth && Math.round(rect.height) === innerHeight,
          covers: minX / scale <= cx && cx <= maxX / scale && minY / scale <= cy && cy <= maxY / scale,
        });
      }, 1200);
    }), guestId);
    assert.ok(landing.sized, 'Canvas matches the viewport at devicePixelRatio 2');
    assert.ok(landing.covers, 'Impact is drawn over the target nameplate');
    console.log('PASS rapid emotions each animate on the canvas layer and land on the target');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
