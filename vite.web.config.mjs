import { readdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { parse as parseYaml } from 'yaml';
import { nimiWebViteConfig } from '@nimiplatform/app-tools/web';
import { readMobileAccess } from './scripts/mobile-config.mjs';

const repoRoot = import.meta.dirname;
const nextRoot = path.join(repoRoot, 'servers', 'nextjs');
const webRoot = path.join(repoRoot, 'web');

function copyPresentonPublicAssets(publicDir, vendorTargetPrefix) {
  return {
    name: 'presenton-public-assets',
    enforce: 'pre',
    async generateBundle() {
      const ctx = this;
      async function walk(relativeDir) {
        const entries = await readdir(path.join(publicDir, relativeDir), { withFileTypes: true });
        for (const entry of entries) {
          const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await walk(relPath);
            continue;
          }
          if (!entry.isFile()) continue;
          const source = await readFile(path.join(publicDir, relPath));
          if (/\.(?:[cm]?js|css|wasm)$/iu.test(relPath)) {
            const outName = vendorTargetPrefix ? `${vendorTargetPrefix}/${relPath}` : relPath;
            ctx.emitFile({ type: 'asset', fileName: outName, source });
          } else {
            ctx.emitFile({ type: 'asset', fileName: relPath, source });
          }
        }
      }
      await walk('');
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const release = mode === 'release' || process.env.NIMI_WEB_RELEASE === '1';
  const serve = command === 'serve';
  if (!release) {
    try {
      process.loadEnvFile(path.join(repoRoot, '.env.web.local'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const manifest = parseYaml(readFileSync(path.join(repoRoot, 'nimi.app.yaml'), 'utf8'));
  if (!release && !process.env.NIMI_DEV_REALM && !manifest.local_development?.web?.origin) {
    process.env.NIMI_DEV_REALM = 'local';
  }
  const env = process.env;
  const webVersion = env.NIMI_WEB_VERSION ?? manifest.version;
  const vendorPrefix = release ? `/_releases/${webVersion}` : '';
  const vendorTargetPrefix = release ? `_releases/${webVersion}` : '';

  const base = nimiWebViteConfig({ root: repoRoot, env, serve, release });
  const rawWebConfig = JSON.parse(base.define.__NIMI_APP_WEB_CONFIG__);

  return {
    root: webRoot,
    base: base.base ?? '/',
    publicDir: serve ? path.join(nextRoot, 'public') : false,
    css: {
      postcss: path.join(nextRoot, 'postcss.config.mjs'),
    },
    resolve: {
      alias: [
        { find: /^next\/navigation$/, replacement: path.join(webRoot, 'src/shims/next-navigation.tsx') },
        { find: /^next\/link$/, replacement: path.join(webRoot, 'src/shims/next-link.tsx') },
        { find: /^next\/image$/, replacement: path.join(webRoot, 'src/shims/next-image.tsx') },
        { find: /^next\/script$/, replacement: path.join(webRoot, 'src/shims/next-script.tsx') },
        { find: /^@\//, replacement: `${nextRoot}/` },
      ],
    },
    define: {
      ...base.define,
      'process.env.NEXT_PUBLIC_NIMI_WEB_CONFIG': JSON.stringify(JSON.stringify(rawWebConfig)),
      'process.env.NEXT_PUBLIC_NIMI_MOBILE_CONFIG': JSON.stringify(release ? '' : JSON.stringify(readMobileAccess())),
      'process.env.NEXT_PUBLIC_PRESENTON_VENDOR_PREFIX': JSON.stringify(vendorPrefix),
      'process.env.NEXT_PUBLIC_PRESENTON_ELECTRON_PLATFORM': JSON.stringify(''),
      'process.env.PRESENTATION_GENERATION_MODE': JSON.stringify(env.PRESENTATION_GENERATION_MODE || 'both'),
      'process.env.PRESENTON_COMMUNITY_ENABLED': JSON.stringify(env.PRESENTON_COMMUNITY_ENABLED || 'true'),
      'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production'),
      'process.env': '{}',
    },
    server: base.server,
    build: {
      outDir: path.join(repoRoot, 'dist-web'),
      emptyOutDir: true,
      assetsDir: base.build?.assetsDir ?? `_releases/${webVersion}/assets`,
      sourcemap: false,
    },
    plugins: [
      react(),
      ...(!serve ? [copyPresentonPublicAssets(path.join(nextRoot, 'public'), vendorTargetPrefix)] : []),
      ...(base.plugins ?? []),
    ],
  };
});
