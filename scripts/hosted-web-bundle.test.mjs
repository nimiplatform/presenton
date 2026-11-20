import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('hosted Web release bundle satisfies static asset layout, CSP, and deep-link routing without a dev proxy', async () => {
  const archiveDir = path.join(repoRoot, '.nimi', 'local');
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, 'test-nimi-web-0.9.12.zip');
  fs.rmSync(archivePath, { force: true });

  const viteCli = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  execFileSync(process.execPath, [viteCli, 'build', '--config', 'vite.web.config.mjs', '--mode', 'release'], {
    cwd: repoRoot,
    env: { ...process.env, NIMI_WEB_VERSION: '0.9.12', NIMI_WEB_ARCHIVE: archivePath },
    stdio: 'pipe',
  });

  try {
    assert.ok(fs.existsSync(archivePath), 'Expected hosted Web release ZIP to be created');
    const distDir = path.join(repoRoot, 'dist-web');
    const manifest = parseYaml(fs.readFileSync(path.join(repoRoot, 'nimi.app.yaml'), 'utf8'));
    const bundleMeta = JSON.parse(fs.readFileSync(path.join(distDir, 'nimi-web-bundle.json'), 'utf8'));
    assert.deepEqual(bundleMeta, {
      format: 'nimi.web-bundle/v1',
      app_id: manifest.app_id,
      slug: manifest.public_slug,
      version: '0.9.12',
      client_id: 'io.github.nimiplatform.presenton.web',
      origin: 'https://presenton.nimi.xyz',
      redirect_uri: 'https://presenton.nimi.xyz/',
      official_web_url: 'https://nimi.ai',
      realm_environment_id: 'production',
      entry: 'index.html',
      app_access: manifest.app_access,
      capability_contract_refs: manifest.capability_contract_refs,
    });

    const walkFiles = (dir, rel = '') => {
      const out = [];
      for (const item of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const entryPath = rel ? `${rel}/${item.name}` : item.name;
        if (item.isDirectory()) out.push(...walkFiles(dir, entryPath));
        else out.push(entryPath);
      }
      return out;
    };
    for (const relPath of walkFiles(distDir)) {
      assert.doesNotMatch(relPath, /^(?:api|\.well-known)(?:\/|$)/i);
      if (relPath.startsWith('_releases/') || /\.(?:[cm]?js|css|wasm)$/iu.test(relPath)) {
        assert.ok(relPath.startsWith('_releases/0.9.12/'), `Executable asset outside versioned release dir: ${relPath}`);
      }
    }

    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
      assert.match(m[1], /\bsrc=/i, 'Inline script tags violate Hosted Web CSP');
      assert.equal(m[2].trim(), '');
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (/^\/(?:api|app_data|static)(?:\/|$)/.test(url.pathname)) {
        res.writeHead(404);
        res.end();
        return;
      }
      let file = path.resolve(distDir, url.pathname.replace(/^\/+/, '') || 'index.html');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (!path.extname(url.pathname)) file = path.join(distDir, 'index.html');
        else {
          res.writeHead(404);
          res.end();
          return;
        }
      }
      res.writeHead(200);
      res.end(fs.readFileSync(file));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const rootRes = await fetch(`${base}/`);
      assert.equal(rootRes.status, 200);
      const servedHtml = await rootRes.text();
      const scriptSrc = servedHtml.match(/<script[^>]+src="([^"]+)"/)[1];
      const cssHref = servedHtml.match(/<link[^>]+href="([^"]+)"/)[1];
      assert.match(scriptSrc, /^\/_releases\/0\.9\.12\/assets\//);
      assert.match(cssHref, /^\/_releases\/0\.9\.12\/assets\//);
      assert.equal((await fetch(base + scriptSrc)).status, 200);
      assert.equal((await fetch(base + cssHref)).status, 200);
      assert.equal((await fetch(`${base}/_releases/0.9.12/vendor/chart-4.5.1.umd.min.js`)).status, 200);
      assert.equal((await fetch(`${base}/vendor/fonts/sans_serif/manrope/Manrope[wght].ttf`)).status, 200);
      for (const deep of ['/dashboard', '/templates', '/presentation?id=demo-id', '/outline']) {
        const deepRes = await fetch(base + deep, { headers: { Accept: 'text/html' } });
        assert.equal(deepRes.status, 200);
        assert.equal(await deepRes.text(), servedHtml);
      }
      assert.equal((await fetch(`${base}/api/user-config`)).status, 404);
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    fs.rmSync(archivePath, { force: true });
  }
});
