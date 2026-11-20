import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { parse } from 'yaml';
import { isWebCoordinationPath, readWebDevelopment, webOriginGuard } from '@nimiplatform/app-tools/web';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const HOSTED_CSP = "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

const root = path.resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(path.join(root, '.env.web.local'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const manifest = parse(readFileSync(path.join(root, 'nimi.app.yaml'), 'utf8'));
if (!process.env.NIMI_DEV_REALM && !manifest.local_development?.web?.origin) {
  process.env.NIMI_DEV_REALM = 'local';
}
const env = { ...process.env };
// The public Web server never reads the private PC backend state.
delete env.PRESENTON_BACKEND_STATE;
delete process.env.PRESENTON_BACKEND_STATE;

if (env.PRESENTON_SKIP_WEB_BUILD !== '1') {
  const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  execFileSync(process.execPath, [viteCli, 'build', '--config', 'vite.web.config.mjs'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
}

const distDir = path.resolve(root, env.PRESENTON_WEB_DIST_DIR || 'dist-web');
const { site, realm } = readWebDevelopment(manifest, { env });
const disableCoordination = env.NIMI_STATIC_NO_COORDINATION === '1';
const guard = webOriginGuard(site);

function resolveStaticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const normalized = decoded.replace(/^\/+/, '');
  if (normalized.includes('\0')) return null;
  const candidate = path.resolve(distDir, normalized || 'index.html');
  if (candidate !== distDir && !candidate.startsWith(distDir + path.sep)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

const server = https.createServer(
  {
    key: readFileSync(path.resolve(root, env.NIMI_WEB_TLS_KEY)),
    cert: readFileSync(path.resolve(root, env.NIMI_WEB_TLS_CERT)),
  },
  (request, response) =>
    guard(request, response, () => {
      const reqUrl = new URL(request.url || '/', site.origin);
      if (!disableCoordination && isWebCoordinationPath(request.method, request.url)) {
        const headers = { ...request.headers, host: realm.host };
        delete headers.cookie;
        const target = (realm.protocol === 'https:' ? https : http).request(
          new URL(request.url, realm),
          { method: request.method, headers },
          (upstream) => {
            const safe = { ...upstream.headers };
            delete safe['set-cookie'];
            response.writeHead(upstream.statusCode ?? 502, safe);
            upstream.pipe(response);
          },
        );
        target.on('error', () => {
          if (!response.headersSent) response.writeHead(502);
          response.end('Nimi sign-in service is unavailable.');
        });
        request.pipe(target);
        return;
      }

      if (/^\/(?:api|app_data|static)(?:\/|$)/.test(reqUrl.pathname)) {
        response.writeHead(404, { 'Cache-Control': 'no-store' });
        response.end();
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }

      let filePath = resolveStaticFile(reqUrl.pathname);
      const acceptHtml = (request.headers.accept || '').includes('text/html');
      const hasExtension = path.extname(reqUrl.pathname) !== '';
      if (!filePath && (acceptHtml || !hasExtension)) {
        filePath = path.join(distDir, 'index.html');
      }
      if (!filePath || !existsSync(filePath)) {
        response.writeHead(404, { 'Cache-Control': 'no-store' });
        response.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const isImmutable = reqUrl.pathname.startsWith('/_releases/');
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': isImmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'Content-Security-Policy': HOSTED_CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      };
      const body = readFileSync(filePath);
      response.writeHead(200, { ...headers, 'Content-Length': body.length });
      if (request.method === 'HEAD') response.end();
      else response.end(body);
    }),
);

server.listen(Number(site.port), env.NIMI_WEB_BIND_HOST || '127.0.0.1', () => {
  console.log(`Presenton Static Web: ${site.origin} (coordination=${!disableCoordination})`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
