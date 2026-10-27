import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, webContents, shell } from 'electron';
import { configureNimiElectronAppHostProfile } from '@nimiplatform/kit/shell/electron/host-profile';

// This is the generated reference Host's profile and protected-session wiring.
try { configureNimiElectronAppHostProfile(app); }
catch (error) { process.stderr.write(`[presenton-host-profile] ${String(error)}\n`); app.exit(78); throw error; }

const { registerNimiElectronAppBridge, registerNimiElectronAppAssetProtocolScheme, isAllowedElectronRendererUrl } = await import('@nimiplatform/kit/shell/electron/main');
const { PresentonBackend, availablePort, helperEnvironment } = await import('./backend.js');
const { spawn } = await import('node:child_process');
declare const __NIMI_ELECTRON_PRODUCTION__: boolean;
const production = __NIMI_ELECTRON_PRODUCTION__;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Native presentation is separate from metadata.icon artwork shown in Nimi Home.
const nativeAppIconPath = path.join(root, 'assets', 'native', process.platform === 'win32' ? 'windows.ico' : process.platform === 'darwin' ? 'macos.png' : 'app.png');
const args = process.argv.filter((arg) => arg.startsWith('--nimi-dev-renderer-url='));
if (process.argv.includes('--nimi-dev-renderer-url') || args.length > 1 || (production && args.length)) throw new Error('Invalid supervised renderer URL');
const developmentUrl = args[0]?.split('=').slice(1).join('=');
if (developmentUrl && developmentUrl !== 'http://127.0.0.1:6016') throw new Error('Renderer URL differs from the Presenton manifest');
if (!production && !developmentUrl) throw new Error('Launch Presenton with pnpm dev');
const origin = developmentUrl || `http://127.0.0.1:${await availablePort()}`;
const routes = ['/', '/dashboard', '/upload', '/outline', '/presentation', '/documents-preview', '/templates', '/custom-template', '/settings', '/community', '/template-preview', '/pdf-maker'];
const allowedRendererUrls = routes.map((route) => origin + route);
const stateFile = developmentUrl ? path.join(root, '.nimi/local/backend.json') : path.join(app.getPath('temp'), 'presenton-backend.json');
const businessRoot = production ? path.join(process.resourcesPath, 'presenton') : root;
const backend = new PresentonBackend({ appRoot: businessRoot, storageRoot: path.join(app.getPath('appData'), 'Presenton Nimi', 'workspaces'), stateFile, rendererOrigin: origin, production });
let bridge: ReturnType<typeof registerNimiElectronAppBridge> | undefined;
let nextProcess: ReturnType<typeof spawn> | undefined;
let quitting = false;

app.setName('Presenton — Nimi');
app.setAppUserModelId('ai.nimi.apps.io.github.nimiplatform.presenton');
Menu.setApplicationMenu(null);
registerNimiElectronAppAssetProtocolScheme(protocol);

async function createWindow() {
  const window = new BrowserWindow({
    icon: nativeAppIconPath, width: 1360, height: 900, minWidth: 800, minHeight: 600, title: 'Presenton',
    webPreferences: { preload: path.join(root, 'dist-electron/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const target = new URL(url);
    if (target.protocol === 'https:' || target.protocol === 'http:') void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => { if (!isAllowedElectronRendererUrl(url, allowedRendererUrls)) event.preventDefault(); });
  try { await window.loadURL(origin); } catch (error) { if (!window.isDestroyed()) throw error; }
}

void app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(nativeAppIconPath);
if (production) {
  let serverError = '';
  nextProcess = spawn(process.execPath, [path.join(businessRoot, 'servers/nextjs/.next-production/standalone/servers/nextjs/server.js')], {
    env: { ...helperEnvironment(), ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: new URL(origin).port,
      PRESENTON_BACKEND_STATE: stateFile, PRESENTON_APP_ROOT: businessRoot, EXPORT_PACKAGE_ROOT: path.join(businessRoot, 'presentation-export') }, cwd: path.join(businessRoot, 'servers/nextjs'), stdio: ['ignore', 'ignore', 'pipe'],
  });
  nextProcess.stderr?.on('data', (chunk) => { serverError = (serverError + chunk.toString('utf8')).slice(-4000); });
  for (let attempt = 0; ; attempt++) {
    try { await fetch(origin); break; } catch (error) {
      if (attempt >= 150 || nextProcess.exitCode !== null) throw new Error(`Presenton's web service could not start.\n${serverError || String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
bridge = registerNimiElectronAppBridge({
  appId: 'io.github.nimiplatform.presenton', allowedRendererUrls, ipcMain,
  assetMediaPlatform: { protocol, webRequest: session.defaultSession.webRequest, webContents },
  appCommandHandlers: {
    'presenton.backend.status': async () => backend.state,
    'presenton.backend.retry': async () => { if (bridge) await backend.start(bridge.services); return backend.state; },
  },
  onSessionReady: (services) => { void backend.start(services); },
  onSessionInvalidated: () => {
    backend.stop();
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    if (!quitting) void createWindow();
  },
});
session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [origin + '/*'] }, (details, callback) => {
  const ownWindow = BrowserWindow.getAllWindows().some((window) => window.webContents.id === details.webContentsId);
  const headers = { ...details.requestHeaders };
  delete headers['X-Presenton-Host'];
  delete headers['x-presenton-host'];
  if (ownWindow && backend.key) headers['X-Presenton-Host'] = backend.key;
  callback({ requestHeaders: headers });
});
await createWindow();
}).catch((error) => {
  quitting = true; backend.stop(); bridge?.unregister(); nextProcess?.kill();
  dialog.showErrorBox('Presenton could not start', String(error instanceof Error ? error.message : error));
  app.exit(1);
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
app.on('before-quit', () => { quitting = true; backend.stop(); bridge?.unregister(); nextProcess?.kill(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
