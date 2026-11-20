/** App-owned document channel. A document binds once and can never acquire another scope. */
let connection: MessagePort | undefined;
let ended = false;
let drafts: Record<string, unknown> = {};
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
let selectedInput: { id: string; input: HTMLInputElement } | undefined;

export function isMobileWorkspace() { return Boolean(connection); }
export function readMobileDraft<T>(key: string): T | undefined { return drafts[key] as T | undefined; }
export function writeMobileDraft(key: string, value: unknown) {
  if (!connection || ended) return;
  drafts[key] = value;
  connection.postMessage({ type: 'draft', key, value });
}
export function saveMobilePresentation(path: string, name: string): Promise<void> {
  if (!connection || ended) return Promise.reject(new Error('The PC connection ended. Reopen the original presentation.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: () => resolve(), reject });
    connection!.postMessage({ type: 'save-export', id, path, name });
  });
}
export function bindMobileWorkspace(port: MessagePort, initialDrafts: Record<string, unknown>, onEnd: () => void) {
  if (connection || ended) throw new Error('This presentation document has already been connected.');
  connection = port;
  drafts = initialDrafts;
  const stop = () => {
    if (ended) return;
    ended = true;
    for (const request of pending.values()) request.reject(new Error('The PC connection ended; no action was replayed.'));
    pending.clear(); selectedInput = undefined; port.close(); onEnd();
  };
  port.onmessage = ({ data }) => {
    if (data.ended) { stop(); return; }
    if (data.type === 'selected-files') {
      const selection = selectedInput;
      if (!selection || selection.id !== data.id || !selection.input.isConnected) return;
      const transfer = new DataTransfer();
      for (const file of data.files) transfer.items.add(file);
      selection.input.files = transfer.files;
      selectedInput = undefined;
      selection.input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const request = pending.get(data.id);
    if (request) { pending.delete(data.id); data.error ? request.reject(new Error(data.error)) : request.resolve(data.result); }
  };
  const business = (event: MessageEvent) => {
    if (event.data?.type !== 'presenton-workspace' || !event.ports[0]) return;
    if (ended) { event.ports[0].postMessage({ error: 'The PC connection ended. Reopen the original task.' }); return; }
    port.postMessage({ type: 'fetch', request: event.data }, [event.ports[0], ...(event.data.body ? [event.data.body] : [])]);
  };
  const choose = (event: MouseEvent) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (ended) return;
    const id = crypto.randomUUID(); selectedInput = { id, input };
    port.postMessage({ type: 'pick-files', id, accept: input.accept, multiple: input.multiple });
  };
  navigator.serviceWorker.addEventListener('message', business);
  document.addEventListener('click', choose, true);
  window.addEventListener('pagehide', stop, { once: true });
  return () => { stop(); navigator.serviceWorker.removeEventListener('message', business); document.removeEventListener('click', choose, true); };
}
