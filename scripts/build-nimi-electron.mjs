import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const production = process.argv.includes('--production');
await mkdir('dist-electron', { recursive: true });
await build({ entryPoints: { main: 'electron/nimi/main.ts' }, outdir: 'dist-electron', splitting: true, chunkNames: 'chunks/[name]-[hash]', bundle: true,
  platform: 'node', target: 'node24', format: 'esm', packages: 'external', sourcemap: !production,
  define: { __NIMI_ELECTRON_PRODUCTION__: JSON.stringify(production) } });
await build({ entryPoints: ['electron/nimi/preload.cts'], outfile: 'dist-electron/preload.cjs', bundle: true,
  platform: 'node', target: 'node24', format: 'cjs', external: ['electron'], sourcemap: !production });
await writeFile('dist-electron/package.json', '{"type":"module"}\n');
