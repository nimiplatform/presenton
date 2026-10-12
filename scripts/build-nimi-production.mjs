import { spawnSync } from 'node:child_process';
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Build Presenton on the declared macos-aarch64 target');
for (const [command, args, cwd] of [
  ['pnpm', ['setup:export'], '.'],
  ['pnpm', ['--dir', 'servers/nextjs', 'build'], '.'],
  ['node', ['../../scripts/nimi-uv.mjs', 'run', '--locked', 'pyinstaller', '--noconfirm', '--distpath', '../../resources', 'nimi-worker.spec'], 'servers/fastapi'],
  ['pnpm', ['sync:presentation-export'], '.'],
  ['node', ['scripts/build-nimi-electron.mjs', '--production'], '.'],
  ['node', ['scripts/package-nimi-electron.mjs'], '.'],
]) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, PRESENTON_ELECTRON_BUILD: 'true' } });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed (${result.status})`);
}
