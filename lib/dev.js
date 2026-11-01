const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

function available(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function main() {
  let port = Number(process.env.DEV_PORT) || 5000;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid DEV_PORT');
  while (!(await available(port))) {
    if (++port > 65535) throw new Error('No available port');
  }
  const env = { ...process.env, DEV_PORT: String(port) };
  const root = path.resolve(__dirname, '..');
  const children = [];
  let stopping = false;
  function stop(code) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode !== null || !child.pid) continue;
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else child.kill();
    }
    process.exitCode = code;
  }
  process.once('SIGINT', () => stop(0));
  process.once('SIGTERM', () => stop(0));
  for (const [name, args] of [
    ['rollup', ['-cw']],
    [
      'serve',
      [
        `--listen=tcp://127.0.0.1:${port}`,
        '--config',
        path.join(root, 'serve.json'),
        '.tmp/build/static',
        '--no-clipboard',
      ],
    ],
  ]) {
    if (name === 'serve') {
      while (
        !fs.existsSync(path.join(root, '.tmp/build/static/index.html')) &&
        !stopping
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (stopping) return;
    }
    const pkg = require(path.join(root, 'node_modules', name, 'package.json'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[name];
    const child = spawn(
      process.execPath,
      [path.join(root, 'node_modules', name, bin), ...args],
      {
        cwd: root,
        env,
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    children.push(child);
    child.once('error', (err) => {
      console.error(err);
      stop(1);
    });
    child.once('exit', (code) => stop(code || 0));
  }
  console.log(`Local: http://127.0.0.1:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
