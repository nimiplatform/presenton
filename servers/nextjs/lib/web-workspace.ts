import type { NimiAppScope } from '@nimiplatform/kit/core/app-session';

const INTEGRATION = 'io.github.nimiplatform.presenton.workspace.v1';
const OPERATIONS = ['workspace.status', 'workspace.upload', 'workspace.request', 'workspace.response', 'workspace.close'];
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function within<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Presenton connection ended'));
    if (signal.aborted) { void promise.catch(() => undefined); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function encode(bytes: Uint8Array) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}

export type WorkspaceFetchRequest = {
  type: 'presenton-workspace';
  path: string;
  method: string;
  contentType: string;
  range: string;
  body: ArrayBuffer | null;
};

export function isBusinessWorkspacePath(pathname: string): boolean {
  return /^\/(?:api\/(?!runtime-access\/|auth\/runtime-clients\/)|app_data\/|static\/)/.test(pathname);
}

export function resolveWorkspaceRoute(rawUrl: string, pageOrigin: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl, pageOrigin);
  } catch {
    return null;
  }
  if (url.origin === pageOrigin && isBusinessWorkspacePath(url.pathname)) {
    return url.pathname + url.search;
  }
  if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && /^\/(?:app_data|static)\//.test(url.pathname)) {
    return url.pathname + url.search;
  }
  return null;
}

/** A captured public scope. Neither a new document nor a reconnect can replace it. */
// @nimi-authority: rule.nimi.sdks.feature-clients.integrations
export async function createWorkspaceTransport(scope: NimiAppScope) {
  const api = scope.client.integration;
  const targets = (await within(api.listCatalog(), scope.signal)).filter(row => row.integrationId === INTEGRATION && row.available);
  if (!targets.length) throw new Error('Open Presenton on your PC and keep it open to use its presentation workspace here.');
  const permitted = targets.filter(row => OPERATIONS.every(operation => row.permittedOperations.includes(operation)));
  if (permitted.length !== 1) throw new Error(permitted.length ? 'More than one Presenton PC workspace is available. In Nimi Home → Integrations, allow only the workspace you want.' : 'In PC Nimi Home → Integrations, allow this App source to use the Presenton workspace operations.');
  const targetRef = permitted[0].targetRef;
  async function call(operation: string, input: unknown, extraSignal?: AbortSignal): Promise<any> {
    const signal = AbortSignal.any([scope.signal, ...(extraSignal ? [extraSignal] : []), AbortSignal.timeout(60_000)]);
    signal.throwIfAborted();
    let phase = 'sending';
    try {
      let result = await within(api.invoke({ targetRef, operation, inputJson: JSON.stringify(input) }), signal);
      phase = 'waiting for the PC reply';
      while (result.status === 'accepted') {
        await within(new Promise(resolve => setTimeout(resolve, 100)), signal);
        result = await within(api.getCall({ callId: result.callId }), signal);
      }
      if (result.status !== 'completed') throw new Error(result.errorCode || result.status);
      return JSON.parse(result.resultJson);
    } catch (error) {
      throw new Error(`${operation} failed while ${phase}: ${error instanceof Error ? error.message : String(error)}. Check the original PC task before retrying; no request was replayed.`);
    }
  }
  if (!(await call('workspace.status', {})).ready) throw new Error('Presenton is still opening its PC workspace. Wait for the PC library, then retry.');
  const active = new Set<AbortController>();
  function handleRequest(input: WorkspaceFetchRequest, port: MessagePort) {
    const id = crypto.randomUUID(), control = new AbortController(); active.add(control);
    port.postMessage({ heartbeat: true }); const heartbeat = setInterval(() => port.postMessage({ heartbeat: true }), 10000);
    const signal = AbortSignal.any([scope.signal, control.signal]); let busy = false, done = false, started = false;
    const fail = (cause: unknown) => { if (done) return; done = true; clearInterval(heartbeat); port.postMessage({ error: cause instanceof Error ? cause.message : String(cause) }); port.close(); active.delete(control); };
    const abort = () => fail(new Error('Presenton connection ended. Reconnect to inspect the original task; unfinished work has not been replayed.'));
    signal.addEventListener('abort', abort, { once: true });
    async function pull() {
      if (busy || done) return; busy = true;
      try {
        let chunk = await call('workspace.response', { id }, signal);
        while (chunk.pending) { await within(new Promise(resolve => setTimeout(resolve, 150)), signal); chunk = await call('workspace.response', { id }, signal); }
        if (chunk.error) throw new Error(chunk.error);
        if (!Number.isInteger(chunk.status) || chunk.status < 200 || chunk.status > 599 || typeof chunk.data !== 'string') throw new Error('Invalid PC response');
        const bytes = Uint8Array.from(atob(chunk.data), char => char.charCodeAt(0));
        port.postMessage({ status: chunk.status, headers: chunk.headers, done: chunk.done, bytes: bytes.buffer }, [bytes.buffer]);
        if (chunk.done) { done = true; clearInterval(heartbeat); port.close(); active.delete(control); signal.removeEventListener('abort', abort); }
      } catch (error) { fail(error); } finally { busy = false; }
    }
    port.onmessage = ({ data }) => { if (data.cancel) { control.abort(); if (started && !scope.signal.aborted) void call('workspace.close', { id }).catch(() => undefined); } else if (data.pull) void pull(); };
    void (async () => {
      try {
        if (input.body) {
          const bytes = new Uint8Array(input.body);
          if (bytes.length > 128 * 1024 * 1024) throw new Error('Uploads are limited to 128 MiB.');
          for (let offset = 0; offset < bytes.length; offset += 65536) await call('workspace.upload', { id, size: bytes.length, offset, data: encode(bytes.subarray(offset, offset + 65536)) }, signal);
        }
        await call('workspace.request', { id, path: input.path, method: input.method, contentType: input.contentType, range: input.range }, signal); started = true; await pull();
      } catch (error) { fail(error); }
    })();
  }
  return { targetRef, handleRequest, dispose: () => { for (const control of active) control.abort(); active.clear(); } };
}

export type WorkspaceTransportLike = Pick<Awaited<ReturnType<typeof createWorkspaceTransport>>, 'handleRequest' | 'dispose'>;

export async function fetchFromWorkspace(
  transport: WorkspaceTransportLike,
  route: string,
  request: Request,
): Promise<Response> {
  request.signal.throwIfAborted();
  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? null : await request.arrayBuffer();
  request.signal.throwIfAborted();
  const channel = new MessageChannel();
  return new Promise<Response>((resolve, reject) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let answered = false;
    let finished = false;
    let timer = setTimeout(() => finishError('The Presenton connection timed out. Check the original PC task before retrying.'), 45_000);

    const cancelFromCaller = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      channel.port1.postMessage({ cancel: true });
      channel.port1.close();
      const reason = request.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      if (!answered) reject(reason);
      else controller?.error(reason);
    };
    request.signal.addEventListener('abort', cancelFromCaller, { once: true });

    function finishError(message: string) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      request.signal.removeEventListener('abort', cancelFromCaller);
      if (!answered) {
        answered = true;
        resolve(new Response(JSON.stringify({ detail: message }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
      } else {
        controller?.error(new Error(message));
      }
      channel.port1.close();
    }

    channel.port1.onmessage = ({ data }) => {
      if (finished) return;
      clearTimeout(timer);
      timer = setTimeout(() => finishError('The Presenton connection ended. Reopen the original task to check its result.'), 45_000);
      if (data.heartbeat) return;
      if (data.error) { finishError(String(data.error)); return; }
      if (!answered) {
        answered = true;
        const stream = new ReadableStream<Uint8Array>({
          start(value) { controller = value; },
          pull() { channel.port1.postMessage({ pull: true }); },
          cancel() {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            request.signal.removeEventListener('abort', cancelFromCaller);
            channel.port1.postMessage({ cancel: true });
            channel.port1.close();
          },
        });
        const nullBody = [204, 205, 304].includes(data.status) || method === 'HEAD';
        resolve(new Response(nullBody ? null : stream, { status: data.status, headers: { ...data.headers, 'Cache-Control': 'no-store' } }));
      }
      if (data.bytes?.byteLength) controller?.enqueue(new Uint8Array(data.bytes));
      if (data.done) {
        finished = true;
        clearTimeout(timer);
        request.signal.removeEventListener('abort', cancelFromCaller);
        try { controller?.close(); } catch { /* already closed */ }
        channel.port1.close();
      }
    };

    transport.handleRequest({
      type: 'presenton-workspace',
      path: route,
      method,
      contentType: request.headers.get('content-type') || '',
      range: request.headers.get('range') || '',
      body,
    }, channel.port2);
  });
}

export async function* parseSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string; id: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = 'message';
  let dataLines: string[] = [];
  let lastId = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += value ? decoder.decode(value, { stream: !done }) : decoder.decode();
      let newlineIndex: number;
      while ((newlineIndex = buffer.search(/\r\n|\r|\n/)) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + (buffer.startsWith('\r\n', newlineIndex) ? 2 : 1));
        if (line === '') {
          if (dataLines.length > 0) {
            yield { event: eventType || 'message', data: dataLines.join('\n'), id: lastId };
          }
          eventType = 'message';
          dataLines = [];
          continue;
        }
        if (line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let fieldValue = colon === -1 ? '' : line.slice(colon + 1);
        if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1);
        if (field === 'event') eventType = fieldValue;
        else if (field === 'data') dataLines.push(fieldValue);
        else if (field === 'id' && !fieldValue.includes('\0')) lastId = fieldValue;
      }
      if (done) {
        if (dataLines.length > 0) {
          yield { event: eventType || 'message', data: dataLines.join('\n'), id: lastId };
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function installInPageWorkspaceBridge(
  transport: WorkspaceTransportLike,
  signal: AbortSignal,
  pageOrigin: string = location.origin,
): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const OriginalEventSource = globalThis.EventSource;
  const blobCache = new Map<string, Promise<string>>();
  const createdBlobUrls = new Set<string>();
  let disposed = false;

  const workspaceFetch: typeof globalThis.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = resolveWorkspaceRoute(rawUrl, pageOrigin);
    if (!route) return originalFetch(input, init);
    const resolvedInput = typeof input === 'string' || input instanceof URL
      ? new URL(route, pageOrigin).href
      : new Request(new URL(route, pageOrigin).href, input);
    const request = new Request(resolvedInput, init);
    return fetchFromWorkspace(transport, route, request);
  };

  class WorkspaceEventSource extends EventTarget {
    static readonly CONNECTING = 0 as const;
    static readonly OPEN = 1 as const;
    static readonly CLOSED = 2 as const;
    readonly CONNECTING = 0 as const;
    readonly OPEN = 1 as const;
    readonly CLOSED = 2 as const;
    readonly url: string = '';
    readonly withCredentials: boolean = false;
    readyState = 0;
    private readonly abortController = new AbortController();
    private openHandler: ((this: EventSource, ev: Event) => any) | null = null;
    private messageHandler: ((this: EventSource, ev: MessageEvent) => any) | null = null;
    private errorHandler: ((this: EventSource, ev: Event) => any) | null = null;

    constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
      super();
      const raw = typeof url === 'string' ? url : url.href;
      const route = resolveWorkspaceRoute(raw, pageOrigin);
      if (!route && OriginalEventSource) {
        return new OriginalEventSource(url, eventSourceInitDict) as unknown as WorkspaceEventSource;
      }
      const resolvedUrl = new URL(route ?? raw, pageOrigin);
      this.url = resolvedUrl.href;
      this.withCredentials = Boolean(eventSourceInitDict?.withCredentials);
      if (!route) {
        queueMicrotask(() => this.failStream());
        return;
      }
      const combinedSignal = AbortSignal.any([signal, this.abortController.signal]);
      void this.consumeStream(route, combinedSignal);
    }

    get onopen() { return this.openHandler; }
    set onopen(handler) {
      if (this.openHandler) this.removeEventListener('open', this.openHandler as EventListener);
      this.openHandler = handler;
      if (handler) this.addEventListener('open', handler as EventListener);
    }

    get onmessage() { return this.messageHandler; }
    set onmessage(handler) {
      if (this.messageHandler) this.removeEventListener('message', this.messageHandler as EventListener);
      this.messageHandler = handler;
      if (handler) this.addEventListener('message', handler as EventListener);
    }

    get onerror() { return this.errorHandler; }
    set onerror(handler) {
      if (this.errorHandler) this.removeEventListener('error', this.errorHandler as EventListener);
      this.errorHandler = handler;
      if (handler) this.addEventListener('error', handler as EventListener);
    }

    private failStream() {
      if (this.readyState === 2) return;
      this.readyState = 2;
      this.dispatchEvent(new Event('error'));
    }

    private async consumeStream(route: string, streamSignal: AbortSignal) {
      try {
        const request = new Request(this.url, { headers: { Accept: 'text/event-stream' }, signal: streamSignal });
        const response = await fetchFromWorkspace(transport, route, request);
        if (this.readyState === 2 || !response.ok || !response.body) {
          this.failStream();
          return;
        }
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
        for await (const frame of parseSseFrames(response.body)) {
          if (this.readyState === 2) return;
          this.dispatchEvent(new MessageEvent(frame.event, { data: frame.data, lastEventId: frame.id, origin: pageOrigin }));
        }
        if (this.readyState !== 2) this.failStream();
      } catch {
        if (this.readyState !== 2) this.failStream();
      }
    }

    close() {
      if (this.readyState === 2) return;
      this.readyState = 2;
      this.abortController.abort();
    }
  }

  function loadAssetBlobUrl(route: string): Promise<string> {
    const cached = blobCache.get(route);
    if (cached) return cached;
    const pending = (async () => {
      const req = new Request(new URL(route, pageOrigin).href, { signal });
      const res = await fetchFromWorkspace(transport, route, req);
      if (!res.ok) throw new Error(`Asset load failed (${res.status}): ${route}`);
      const blob = await res.blob();
      signal.throwIfAborted();
      const blobUrl = URL.createObjectURL(blob);
      if (disposed) {
        URL.revokeObjectURL(blobUrl);
        throw new Error('Workspace closed');
      }
      createdBlobUrls.add(blobUrl);
      return blobUrl;
    })().catch((err) => {
      blobCache.delete(route);
      throw err;
    });
    blobCache.set(route, pending);
    return pending;
  }

  const restoreDomHooks: Array<() => void> = [];
  if (typeof HTMLImageElement !== 'undefined' && typeof document !== 'undefined') {
    const imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    const origSetAttribute = Element.prototype.setAttribute;
    const requestedRoutes = new WeakMap<HTMLImageElement, string>();

    const hydrateImage = (img: HTMLImageElement, rawValue: string) => {
      if (!rawValue || rawValue.startsWith('blob:') || rawValue.startsWith('data:')) return false;
      const route = resolveWorkspaceRoute(rawValue, pageOrigin);
      if (!route || !/^\/(?:app_data|static)\//.test(route)) return false;
      if (requestedRoutes.get(img) === route && img.currentSrc.startsWith('blob:')) return true;
      requestedRoutes.set(img, route);
      imgSrcDesc?.set?.call(img, TRANSPARENT_PIXEL);
      void loadAssetBlobUrl(route).then((blobUrl) => {
        if (disposed || requestedRoutes.get(img) !== route) return;
        imgSrcDesc?.set?.call(img, blobUrl);
      }).catch(() => {
        if (disposed || requestedRoutes.get(img) !== route) return;
        img.dispatchEvent(new Event('error'));
      });
      return true;
    };

    if (imgSrcDesc?.set && imgSrcDesc?.get) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: imgSrcDesc.enumerable,
        get() {
          return imgSrcDesc.get!.call(this);
        },
        set(value: string) {
          if (!hydrateImage(this, String(value ?? ''))) {
            requestedRoutes.delete(this);
            imgSrcDesc.set!.call(this, value);
          }
        },
      });
      restoreDomHooks.push(() => Object.defineProperty(HTMLImageElement.prototype, 'src', imgSrcDesc));
    }

    Element.prototype.setAttribute = function patchedSetAttribute(name: string, value: string) {
      if (this instanceof HTMLImageElement && name.toLowerCase() === 'src') {
        if (hydrateImage(this, String(value ?? ''))) return;
        requestedRoutes.delete(this);
      }
      return origSetAttribute.call(this, name, value);
    };
    restoreDomHooks.push(() => { Element.prototype.setAttribute = origSetAttribute; });

    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      const scanTree = (node: Node) => {
        if (node instanceof HTMLImageElement) {
          const attr = node.getAttribute('src');
          if (attr) hydrateImage(node, attr);
        } else if (node instanceof Element || node instanceof DocumentFragment) {
          node.querySelectorAll('img[src]').forEach((el) => {
            const attr = el.getAttribute('src');
            if (attr) hydrateImage(el as HTMLImageElement, attr);
          });
        }
      };
      scanTree(document.documentElement);
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes' && record.target instanceof HTMLImageElement) {
            const attr = record.target.getAttribute('src');
            if (attr) hydrateImage(record.target, attr);
          } else {
            record.addedNodes.forEach(scanTree);
          }
        }
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
      restoreDomHooks.push(() => observer.disconnect());
    }
  }

  globalThis.fetch = workspaceFetch;
  globalThis.EventSource = WorkspaceEventSource as unknown as typeof EventSource;

  return () => {
    if (disposed) return;
    disposed = true;
    globalThis.fetch = originalFetch;
    globalThis.EventSource = OriginalEventSource;
    for (const restore of restoreDomHooks.reverse()) restore();
    for (const blobUrl of createdBlobUrls) URL.revokeObjectURL(blobUrl);
    createdBlobUrls.clear();
    blobCache.clear();
  };
}

export async function connectWebWorkspace(scope: NimiAppScope) {
  const transport = await createWorkspaceTransport(scope);
  const uninstall = installInPageWorkspaceBridge(transport, scope.signal, location.origin);
  return () => {
    uninstall();
    transport.dispose();
  };
}

/** The main Android frame downloads through its captured connection, never a mutable global fetch. */
export function readWorkspaceExport(transport: Awaited<ReturnType<typeof createWorkspaceTransport>>, path: string): Promise<Response> {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin || url.pathname !== '/api/export-presentation/file') return Promise.reject(new Error('Only Presenton exports can be saved.'));
  return fetchFromWorkspace(transport, url.pathname + url.search, new Request(url.href));
}
