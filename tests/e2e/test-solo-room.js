const assert = require('node:assert/strict');
const { launchBrowser } = require('../support/browser');

async function run() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(process.env.POKER_TEST_URL);
    await page.waitForFunction(() => Net.connected);
    await page.evaluate(() => {
      Net.send('user:register', { username: 'soloTester', password: 'test123' });
    });
    await page.waitForFunction(() => isRegistered);
    await page.evaluate(() => Net.send('room:create', { options: { maxPlayers: 2 } }));
    await page.waitForSelector('#roomScreen.active #addBotBtn', { visible: true });
    await page.evaluate(() => document.getElementById('addBotBtn').click());
    await page.waitForFunction(() => document.getElementById('addBotBtn').disabled);
    await page.evaluate(() => {
      window.botActions = [];
      Net.on('game:actionLog', entry => {
        if (entry.playerName === '人机 1') window.botActions.push(entry.action);
      });
      let firstTurn = true;
      Net.on('game:yourTurn', turn => {
        Net.send('game:action', firstTurn ? { action: 'raise', amount: 520 }
          : { action: turn.toCall > 0 ? 'call' : 'check' });
        firstTurn = false;
      });
      Net.on('game:waitingForNext', () => Net.send('game:nextHand'));
      document.getElementById('startGameBtn').click();
    });
    await page.waitForFunction(() => gameState?.handNum >= 2);
    const botActions = await page.evaluate(() => window.botActions.filter(a => !['smallBlind', 'bigBlind'].includes(a)));
    assert.ok(botActions.includes('call') && botActions.includes('check'));
    assert.ok(botActions.every(a => ['call', 'check'].includes(a)));
    console.log('PASS solo host adds a calling bot, completes a hand and starts the next');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
