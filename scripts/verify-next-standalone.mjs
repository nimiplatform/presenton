import { spawn } from 'node:child_process';
import { cp, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function stopServer(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    if (!process.env.SystemRoot) throw new Error('Windows SystemRoot is unavailable for cleanup.');
    await new Promise((resolve, reject) => {
      const killer = spawn(path.join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', reject);
      killer.once('exit', code => code === 0 || child.exitCode !== null || child.signalCode !== null
        ? resolve() : reject(new Error(`Could not stop the packaged server (${code}).`)));
    });
    await exited;
    return;
  }
  const signal = name => { try { process.kill(-child.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
  signal('SIGTERM');
  const force = setTimeout(() => signal('SIGKILL'), 2000);
  try { await exited; } finally { clearTimeout(force); }
}

// An in-checkout launch can borrow absent modules from ancestor node_modules.
// Exercise the actual resource copy before publishing or installing it.
export async function verifyNextStandalone(resourceRoot) {
  const temporaryRoot = await realpath(tmpdir());
  const isolated = await mkdtemp(path.join(temporaryRoot, 'presenton-next-'));
  let child, reservation;
  try {
    await cp(resourceRoot, isolated, { recursive: true, dereference: process.platform === 'win32', verbatimSymlinks: process.platform !== 'win32' });
    const serverRoot = path.join(isolated, 'servers/nextjs');
    const entry = await realpath(path.join(serverRoot, 'server.js'));
    reservation = createServer();
    await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    reservation = undefined;
    const environment = { NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port) };
    for (const name of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'LANG']) {
      if (process.env[name] !== undefined) environment[name] = process.env[name];
    }
    child = spawn(process.execPath, [entry], { cwd: serverRoot, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: environment });
    let failure, diagnostics = '';
    child.once('error', error => { failure = error; });
    const capture = chunk => { diagnostics = (diagnostics + chunk.toString('utf8')).slice(-12000); };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Packaged Next server exited (${child.signalCode ?? child.exitCode}).\n${diagnostics}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) });
        const ready = response.ok && response.headers.get('content-type')?.includes('text/html');
        await response.body?.cancel();
        if (ready && child.exitCode === null && child.signalCode === null) {
          process.stdout.write('[presenton-package] Isolated Next server returned its HTML successfully.\n');
          return;
        }
      } catch { /* The exact owned server is starting; retain the bounded deadline. */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Packaged Next server did not return its HTML.\n${diagnostics}`);
  } finally {
    if (reservation?.listening) await new Promise(resolve => reservation.close(resolve));
    await stopServer(child);
    if (path.dirname(isolated) !== temporaryRoot || !path.basename(isolated).startsWith('presenton-next-')) throw new Error('Refusing cleanup outside the owned renderer check.');
    await rm(isolated, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Supply the standalone resource directory.');
  await verifyNextStandalone(await realpath(process.argv[2]));
}
