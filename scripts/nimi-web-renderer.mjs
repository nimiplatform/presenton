import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { parse } from 'yaml';
import { readWebDevelopment, isWebCoordinationPath, webOriginGuard } from '@nimiplatform/app-tools/web';
import { readMobileAccess } from './mobile-config.mjs';

const root = path.resolve(import.meta.dirname, '..');
try { process.loadEnvFile(path.join(root, '.env.web.local')); } catch (error) { if(error.code !== 'ENOENT')throw error; }
const { site, realm, config } = readWebDevelopment(parse(readFileSync(path.join(root, 'nimi.app.yaml'), 'utf8')));
process.env.NEXT_PUBLIC_NIMI_WEB_CONFIG = JSON.stringify(config);
process.env.NEXT_PUBLIC_NIMI_MOBILE_CONFIG = JSON.stringify(readMobileAccess());
process.env.PRESENTON_WEB = 'true';
// The public Web server never reads the private PC backend state.
delete process.env.PRESENTON_BACKEND_STATE;
const require = createRequire(path.join(root, 'servers/nextjs/package.json'));
const next = require('next');
const app = next({ dev: true, dir: path.join(root, 'servers/nextjs'), hostname: site.hostname, port: Number(site.port) });
await app.prepare();
const handle = app.getRequestHandler();
const guard = webOriginGuard(site);
const server = https.createServer({
  key: readFileSync(process.env.NIMI_WEB_TLS_KEY), cert: readFileSync(process.env.NIMI_WEB_TLS_CERT),
}, (request, response) => guard(request, response, () => {
  if (isWebCoordinationPath(request.method, request.url)) {
    const headers = { ...request.headers, host: realm.host }; delete headers.cookie;
    const target = (realm.protocol === 'https:' ? https : http).request(new URL(request.url, realm), { method: request.method, headers }, upstream => {
      const safe = { ...upstream.headers }; delete safe['set-cookie'];
      response.writeHead(upstream.statusCode ?? 502, safe); upstream.pipe(response);
    });
    target.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Nimi sign-in service is unavailable.'); });
    request.pipe(target);
    return;
  }
  if (/^\/(?:app_data|static)(?:\/|$)/.test(request.url)) { response.writeHead(401); response.end(); return; }
  void handle(request, response);
}));
server.on('upgrade', app.getUpgradeHandler());
server.listen(Number(site.port), process.env.NIMI_WEB_BIND_HOST || '127.0.0.1', () => console.log(`Presenton Web: ${site.origin}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); void app.close().finally(() => process.exit()); });
