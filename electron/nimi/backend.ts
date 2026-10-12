import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import type { NimiElectronAppBusinessServices } from '@nimiplatform/kit/shell/electron/main';
import { consumePresentationAI } from './ai.js';

export async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

export function helperEnvironment(): Record<string, string> {
  const env: Record<string, string> = { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', NEXT_TELEMETRY_DISABLED: '1', MEM0_TELEMETRY: 'false' };
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  return env;
}

export class PresentonBackend {
  key = '';
  state: { ready: boolean; message: string } = { ready: false, message: 'Connecting to Nimi…' };
  private child?: ChildProcessWithoutNullStreams;
  private epoch = 0;
  private starting = false;
  private pending = new Map<string, AbortController>();
  constructor(private options: { appRoot: string; storageRoot: string; stateFile: string; rendererOrigin: string; production: boolean }) {}

  stop() {
    this.epoch++;
    this.starting = false;
    this.key = '';
    this.state = { ready: false, message: 'Nimi access changed. Waiting for a new session.' };
    rmSync(this.options.stateFile, { force: true });
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
    const child = this.child;
    this.child = undefined;
    if (child?.pid) {
      // All deterministic export/document helpers are in this App-owned group.
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
    }
  }

  async start(services: NimiElectronAppBusinessServices) {
    if (this.starting || this.state.ready) return;
    this.stop();
    this.starting = true;
    const epoch = this.epoch;
    try {
      let workspace: any;
      try { workspace = (await services.storage.readJson('presenton/workspace.json')).value; }
      catch (error: any) { if (error.reasonCode !== 'not-found') throw error; }
      if (!workspace) {
        workspace = { id: randomUUID() };
        await services.storage.writeJson('presenton/workspace.json', workspace);
      }
      if (!/^[0-9a-f-]{36}$/.test(workspace.id)) throw new Error('Invalid Presenton workspace identity');
      if (epoch !== this.epoch) return;
      const dataDirectory = path.join(this.options.storageRoot, workspace.id);
      mkdirSync(dataDirectory, { recursive: true });
      const key = randomBytes(32).toString('hex');
      const port = await availablePort();
      if (epoch !== this.epoch) return;
      const backendRoot = path.join(this.options.appRoot, 'servers', 'fastapi');
      const browserRoot = path.join(this.options.appRoot, 'electron/resources/chromium');
      const browserManifest = path.join(browserRoot, 'presenton-runtime.json');
      const exportExecutable = existsSync(browserManifest) ? path.resolve(browserRoot, JSON.parse(readFileSync(browserManifest, 'utf8')).executable) : '';
      if (exportExecutable && (!exportExecutable.startsWith(browserRoot + path.sep) || !existsSync(exportExecutable))) throw new Error('Presenton export browser is incomplete; run pnpm setup:export');
      const python = this.options.production ? path.join(this.options.appRoot, 'resources', 'presenton-worker', 'presenton-worker')
        : path.join(backendRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      const args = this.options.production ? [String(port)] : ['nimi_worker.py', String(port)];
      const child = spawn(python, args, {
        cwd: backendRoot, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
        env: { ...helperEnvironment(), PRESENTON_HOST_KEY: key, APP_DATA_DIRECTORY: dataDirectory,
          TEMP_DIRECTORY: path.join(dataDirectory, 'tmp'), USER_CONFIG_PATH: path.join(dataDirectory, 'business-settings.json'),
          CAN_CHANGE_KEYS: 'false', DISABLE_AUTH: 'true', LITEPARSE_NODE_BINARY: process.execPath, ELECTRON_RUN_AS_NODE: '1',
          PRESENTON_ELECTRON: 'true', PUPPETEER_EXECUTABLE_PATH: exportExecutable,
          // The renderer proxies /app_data and /static on its own origin.
          // Keep stored asset references relative: its port changes on restart.
          NEXT_PUBLIC_URL: this.options.rendererOrigin,
          PRESENTON_APP_ROOT: this.options.appRoot, EXPORT_PACKAGE_ROOT: path.join(this.options.appRoot, 'presentation-export'),
        },
      });
      this.child = child;
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-6000); process.stderr.write(chunk); });
      const send = (value: unknown) => {
        if (epoch !== this.epoch || !child.stdin.writable) return;
        child.stdin.write(JSON.stringify(value) + '\n', 'utf8');
      };
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Presenton backend startup timed out')), 120000);
        const fail = (error: Error) => { clearTimeout(timeout); reject(error); };
        child.once('error', fail);
        child.once('exit', (code) => {
          fail(new Error(`Presenton backend stopped (${code}). ${stderr.slice(-1500)}`));
          if (epoch === this.epoch) { this.stop(); this.state.message = `Presenton backend stopped (${code}). Restart Presenton through Nimi.`; }
        });
        let buffered = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          buffered += chunk;
          if (Buffer.byteLength(buffered) > 48 * 1024 * 1024) { fail(new Error('Presenton worker message is too large')); this.stop(); return; }
          for (;;) {
            const end = buffered.indexOf('\n');
            if (end < 0) break;
            const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
            let message: any;
            try { message = JSON.parse(line); } catch { fail(new Error('Invalid Presenton worker protocol')); this.stop(); return; }
            if (message.type === 'ready' && message.port === port) { clearTimeout(timeout); resolve(); continue; }
            if (message.operation === 'cancel') { this.pending.get(message.id)?.abort(); continue; }
            if (!['text', 'image', 'embed'].includes(message.operation) || typeof message.id !== 'string' || this.pending.has(message.id)) {
              send({ id: message.id, type: 'error', message: 'Invalid Presenton AI request' }); continue;
            }
            const controller = new AbortController();
            this.pending.set(message.id, controller);
            void consumePresentationAI(services, message.operation, message.payload, controller.signal,
              (text) => send({ id: message.id, type: 'delta', text }))
              .then((value) => { controller.signal.throwIfAborted(); send({ id: message.id, type: 'result', value }); })
              .catch((error) => send({ id: message.id, type: 'error', message: error instanceof Error ? error.message : String(error), reasonCode: error?.reasonCode, actionHint: error?.actionHint, retryable: error?.retryable === true }))
              .finally(() => this.pending.delete(message.id));
          }
        });
      });
      if (epoch !== this.epoch) return;
      const state = { key, origin: `http://127.0.0.1:${port}`, dataDirectory, rendererOrigin: this.options.rendererOrigin, exportExecutable };
      mkdirSync(path.dirname(this.options.stateFile), { recursive: true });
      const temporary = this.options.stateFile + '.' + randomUUID();
      writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
      renameSync(temporary, this.options.stateFile);
      this.key = key;
      this.state = { ready: true, message: '' };
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.stop();
      this.state = { ready: false, message: error instanceof Error ? error.message : String(error) };
      process.stderr.write(`[presenton-backend] ${this.state.message}\n`);
    } finally { if (epoch === this.epoch) this.starting = false; }
  }
}
