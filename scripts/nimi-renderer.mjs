import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererRequire = createRequire(path.join(root, 'servers/nextjs/package.json'));
const child = spawn(process.execPath, [rendererRequire.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '6016'], {
  cwd: path.join(root, 'servers/nextjs'), windowsHide: true, stdio: 'inherit',
  env: { ...process.env, PRESENTON_BACKEND_STATE: path.join(root, '.nimi/local/backend.json') },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
