import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const windows = process.platform === 'win32' && process.arch === 'x64';
if (!windows && !(process.platform === 'darwin' && process.arch === 'arm64')) throw new Error('Build Presenton on Windows x86_64 or macOS arm64');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.resolve(projectRoot, 'servers/nextjs/.next-production/standalone');
if (!standalone.startsWith(projectRoot + path.sep)) throw new Error('Unexpected standalone output directory');
rmSync(standalone, { recursive: true, force: true });
// Next rewrites this tracked development projection for its production distDir.
// Preserve the source input while shipping the generated standalone renderer.
const nextEnvironmentPath = 'servers/nextjs/next-env.d.ts';
const nextEnvironment = readFileSync(nextEnvironmentPath);
try {
for (const [command, args, cwd] of [
  ['pnpm', ['setup:export'], '.'],
  ['pnpm', ['--dir', 'servers/nextjs', 'build'], '.'],
  ['node', ['../../scripts/nimi-uv.mjs', 'run', '--locked', '--python', '3.11', 'pyinstaller', '--noconfirm', '--distpath', '../../resources', 'nimi-worker.spec'], 'servers/fastapi'],
  ['pnpm', ['sync:presentation-export'], '.'],
  ['node', ['scripts/build-nimi-electron.mjs', '--production'], '.'],
  ['node', ['scripts/package-nimi-electron.mjs'], '.'],
]) {
  const executable = command === 'node' ? process.execPath : windows ? 'corepack.cmd' : 'corepack';
  const commandArgs = command === 'pnpm' ? ['pnpm', ...args] : args;
  const result = spawnSync(executable, commandArgs, { cwd, stdio: 'inherit', windowsHide: true, shell: windows && command === 'pnpm', env: { ...process.env, PRESENTON_ELECTRON_BUILD: 'true' } });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed (${result.status})`);
}
} finally {
  writeFileSync(nextEnvironmentPath, nextEnvironment);
}
