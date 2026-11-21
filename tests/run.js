const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const groups = {
  unit: ['unit/test-sidepot-refund', 'unit/test-admin-gift-shop', 'integration/test-all-scenarios'],
  network: ['integration/test-admin-ws-smoke', 'integration/test-room', 'integration/test-game-regressions', 'integration/test-turn'],
  browser: ['e2e/test-display', 'e2e/test-solo-room'],
  screenshots: ['e2e/test-browser', 'e2e/inspect-game'],
};

async function run() {
  const selected = process.argv.slice(2);
  const suites = selected.length ? selected : ['unit', 'network', 'browser'];
  for (const suite of suites) {
    if (!Object.hasOwn(groups, suite)) throw Error('Unknown suite: ' + suite);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-suite-'));
  const env = { ...process.env, POKER_DATA_DIR: dir, PORT: '0', POKER_HOST: '127.0.0.1' };
  let server;
  let child;
  const stop = () => { child?.kill(); server?.kill(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    if (suites.some(group => group !== 'unit')) {
      server = fork(path.join(__dirname, 'support/serve.js'), [], { env, silent: false });
      const port = await Promise.race([
        once(server, 'message').then(([port]) => port),
        once(server, 'exit').then(() => { throw Error('Test server exited'); }),
      ]);
      env.POKER_TEST_URL = 'http://127.0.0.1:' + port;
    }
    for (const suite of suites) {
      for (const file of groups[suite]) {
        child = spawn(process.execPath, [path.join(__dirname, file + '.js')], {
          env, stdio: 'inherit', timeout: 180000,
        });
        const [code, signal] = await once(child, 'close');
        child = null;
        if (code !== 0) throw Error(file + ' failed: ' + (signal || code));
      }
    }
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      const closed = once(server, 'close');
      server.kill();
      await closed;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
