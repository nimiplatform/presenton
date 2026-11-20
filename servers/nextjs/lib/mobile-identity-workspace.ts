/** Only unsubmitted App drafts and user-selected files survive a Runtime connection. */
export class MobileIdentityWorkspace {
  target = '';
  route = '/';
  drafts: Record<string, unknown> = {};
  files: File[] = [];
  private recipient?: { id: string; send(value: unknown): void; signal: AbortSignal };
  constructor(readonly signal: AbortSignal, private changed: () => void) {
    signal.addEventListener('abort', () => { this.files = []; this.drafts = {}; this.recipient = undefined; }, { once: true });
  }
  bind(target: string) {
    if (this.target && this.target !== target) { this.files = []; this.drafts = {}; this.route = '/'; this.recipient = undefined; }
    this.target = target;
  }
  request(id: string, signal: AbortSignal, send: (value: unknown) => void) {
    this.signal.throwIfAborted(); signal.throwIfAborted();
    const recipient = { id, signal, send }; this.recipient = recipient;
    signal.addEventListener('abort', () => { if (this.recipient === recipient) { this.recipient = undefined; this.changed(); } }, { once: true });
    this.changed();
  }
  selected(files: File[]) { if (!this.signal.aborted) { this.files = files; this.changed(); } }
  canDeliver() { return this.files.length > 0 && Boolean(this.recipient && !this.recipient.signal.aborted && !this.signal.aborted); }
  deliver() {
    if (!this.canDeliver()) return;
    this.recipient!.send({ type: 'selected-files', id: this.recipient!.id, files: this.files });
    this.files = []; this.recipient = undefined; this.changed();
  }
  discard() { this.files = []; this.recipient = undefined; this.changed(); }
  setRoute(route: string) {
    const url = new URL(route, 'https://presenton.invalid');
    if (url.origin !== 'https://presenton.invalid') return;
    // These pages start generation on mount. Reconnect opens the library instead.
    if (url.pathname === '/outline' || url.searchParams.get('stream') === 'true') { this.route = '/'; return; }
    this.route = url.pathname + url.search;
  }
}
