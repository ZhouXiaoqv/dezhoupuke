const puppeteer = require('puppeteer-core');

exports.launchBrowser = () => puppeteer.launch({
  ...(process.env.POKER_BROWSER
    ? { executablePath: process.env.POKER_BROWSER }
    : { channel: 'chrome' }),
  headless: true,
  args: ['--window-size=1280,900', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 900 },
});

// Open two independent sessions so screenshot tools exercise a real multiplayer hand.
exports.startTwoPlayerHand = async (browser, host) => {
  const guestContext = await browser.createBrowserContext();
  const guest = await guestContext.newPage();
  const suffix = Date.now().toString(36);
  for (const [page, prefix] of [[host, 'h'], [guest, 'g']]) {
    await page.goto(process.env.POKER_TEST_URL);
    await page.waitForFunction(() => Net.connected);
    await page.evaluate(username => Net.send('user:register', { username, password: 'test123' }), prefix + suffix);
    await page.waitForFunction(() => isRegistered);
  }
  await host.evaluate(() => Net.send('room:create', {}));
  await host.waitForFunction(() => !!roomCode);
  const code = await host.evaluate(() => roomCode);
  await guest.evaluate(code => Net.send('room:join', { code }), code);
  await host.waitForFunction(() => document.querySelectorAll('#roomPlayers .room-player-card').length === 2);
  await guest.evaluate(() => Net.on('game:yourTurn', turn => {
    Net.send('game:action', { action: turn.toCall > 0 ? 'call' : 'check' });
  }));
  await host.bringToFront();
  await host.evaluate(() => Net.send('room:start'));
  await host.waitForSelector('#table-container.active .seat');
};
