'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createMobileNimiAppSession } from '@nimiplatform/kit/auth/app/mobile';
import { NimiAppAccessGate, NimiAppSessionProvider, useNimiAppSession, type NimiAppScope } from '@nimiplatform/kit/auth/app';
import { NimiThemeProvider, TooltipProvider } from '@nimiplatform/kit/ui';
import { createWorkspaceTransport, readWorkspaceExport } from '@/lib/web-workspace';
import { bindMobileWorkspace } from '@/lib/mobile-workspace-client';
import { MobileIdentityWorkspace } from '@/lib/mobile-identity-workspace';
import { saveAndroidExport } from '@/lib/android-export';
import RemoteAccountHeader from './RemoteAccountHeader';

let documentSession: ReturnType<typeof createMobileNimiAppSession> | undefined;
function getSession() {
  if (!process.env.NEXT_PUBLIC_NIMI_MOBILE_CONFIG) throw new Error('Android is not configured on this editor service.');
  return documentSession ??= createMobileNimiAppSession(JSON.parse(process.env.NEXT_PUBLIC_NIMI_MOBILE_CONFIG));
}

function Workspace({ scope, workspace, choose, save }: {
  scope: NimiAppScope; workspace: MobileIdentityWorkspace;
  choose(accept: string, multiple: boolean): void;
  save(response: Promise<Response>, name: string): Promise<void>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [attempt, retry] = useState(0);
  const [route, setRoute] = useState('/');
  useEffect(() => {
    const control = new AbortController(), signal = AbortSignal.any([scope.signal, control.signal]);
    let transport: Awaited<ReturnType<typeof createWorkspaceTransport>> | undefined, port: MessagePort | undefined;
    setReady(false); setError('');
    const receive = (event: MessageEvent) => {
      if (signal.aborted || port || !transport || event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data !== 'presenton-mobile-ready') return;
      const channel = new MessageChannel(); port = channel.port1;
      const captured = port, capturedTransport = transport;
      captured.onmessage = (event) => {
        if (signal.aborted) return;
        const data = event.data;
        if (data.type === 'fetch' && event.ports[0]) { capturedTransport.handleRequest(data.request, event.ports[0]); return; }
        if (data.type === 'route' && typeof data.route === 'string') { workspace.setRoute(data.route); return; }
        if (data.type === 'draft' && typeof data.key === 'string' && /^(upload|chat):/.test(data.key)) { workspace.drafts[data.key] = data.value; return; }
        if (data.type === 'pick-files' && typeof data.id === 'string' && typeof data.accept === 'string') {
          workspace.request(data.id, signal, value => captured.postMessage(value));
          if (!workspace.files.length) choose(data.accept, data.multiple === true);
          return;
        }
        if (data.type === 'save-export' && typeof data.path === 'string' && typeof data.name === 'string') {
          void save(readWorkspaceExport(capturedTransport, data.path), data.name).then(
            () => { if (!signal.aborted) captured.postMessage({ id: data.id, result: true }); },
            cause => { if (!signal.aborted) captured.postMessage({ id: data.id, error: String(cause) }); },
          );
        }
      };
      frame.current!.contentWindow!.postMessage({ type: 'presenton-mobile-connect', drafts: workspace.drafts }, location.origin, [channel.port2]);
    };
    window.addEventListener('message', receive);
    void (async () => {
      try {
        const current = await createWorkspaceTransport(scope);
        if (signal.aborted) { current.dispose(); return; }
        transport = current; workspace.bind(current.targetRef);
        setRoute(workspace.route); setReady(true);
      } catch (cause) { if (!signal.aborted) setError(String(cause)); }
    })();
    return () => { control.abort(); port?.postMessage({ ended: true }); port?.close(); transport?.dispose(); window.removeEventListener('message', receive); };
  }, [scope, workspace, choose, save, attempt]);
  return ready ? <iframe ref={frame} key={attempt} src={route} title="Presenton presentation workspace" className="block min-h-0 w-full flex-1 border-0" />
    : <section className="space-y-4 p-6"><h1 className="text-xl">Connect to your PC presentations</h1>
      <p>Keep Nimi and Presenton open on your PC. Models and presentation files stay in that workspace.</p>
      <p role="status" className="break-words">{error || 'Connecting to the PC workspace…'}</p>
      {error && <button className="min-h-11 rounded border px-4" onClick={() => retry(n => n + 1)}>Retry PC connection</button>}</section>;
}

function IdentityWorkspace({ signal }: { signal: AbortSignal }) {
  const input = useRef<HTMLInputElement>(null);
  const [, update] = useState(0);
  const [workspace] = useState(() => new MobileIdentityWorkspace(signal, () => update(n => n + 1)));
  const [delivery, setDelivery] = useState('');
  const [choose] = useState(() => (accept: string, multiple: boolean) => {
    if (!input.current) return;
    input.current.accept = accept; input.current.multiple = multiple; input.current.click();
  });
  const [save] = useState(() => async (response: Promise<Response>, name: string) => {
    setDelivery(`Transferring ${name} from your PC…`);
    try { await saveAndroidExport(await response, name, signal); if (!signal.aborted) setDelivery(`Saved ${name}.`); }
    catch (cause) { if (!signal.aborted) setDelivery(String(cause)); throw cause; }
  });
  return <>
    <input ref={input} type="file" hidden aria-label="Select presentation files" onChange={event => {
      workspace.selected(Array.from(event.currentTarget.files || [])); event.currentTarget.value = '';
    }} />
    {workspace.files.length > 0 && <section className="space-y-2 border-b bg-white p-3 text-sm" aria-live="polite">
      <strong className="break-words">{workspace.files.map(file => file.name).join(', ')}</strong>
      <p>{workspace.canDeliver() ? 'Use these files for the upload action you opened. Your presentation will keep its normal upload limits.' : 'Your files are retained. Reconnect, then reopen the upload action to use them. Unfinished work was not replayed.'}</p>
      <div className="flex flex-wrap gap-2"><button disabled={!workspace.canDeliver()} className="min-h-11 rounded border px-3 disabled:opacity-50" onClick={() => workspace.deliver()}>Use selected files</button>
        <button className="min-h-11 rounded border px-3" onClick={() => workspace.discard()}>Discard selection</button></div>
    </section>}
    {delivery && <p role="status" className="break-words border-b p-3 text-sm">{delivery}</p>}
    <NimiAppAccessGate externalAccountControl title="Presenton" language="en">{scope => <Workspace key={scope.viewKey} scope={scope} workspace={workspace} choose={choose} save={save}/>}</NimiAppAccessGate>
  </>;
}
function Shell() {
  const { snapshot } = useNimiAppSession();
  const identity = snapshot.identity.status === 'signed-in' ? snapshot.identity : null;
  return <div className="flex h-dvh min-w-0 flex-col overflow-hidden"><RemoteAccountHeader/>
    <NimiAppAccessGate externalAccountControl requireRuntime={false} title="Presenton" language="en">
      {identity && <IdentityWorkspace key={identity.viewKey} signal={identity.signal}/>}</NimiAppAccessGate></div>;
}
function Entry() {
  const [session] = useState(getSession);
  useEffect(() => { void session.start(); }, [session]);
  return <NimiThemeProvider accentPack="nimi-accent"><TooltipProvider><NimiAppSessionProvider session={session}><Shell/></NimiAppSessionProvider></TooltipProvider></NimiThemeProvider>;
}
function BusinessDocument({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false), [ended, setEnded] = useState(false);
  const port = useRef<MessagePort | undefined>(undefined);
  const pathname = usePathname(), params = useSearchParams();
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (port.current || event.source !== parent || event.origin !== location.origin || event.data?.type !== 'presenton-mobile-connect' || !event.ports[0]) return;
      port.current = event.ports[0]; bindMobileWorkspace(event.ports[0], event.data.drafts, () => setEnded(true)); setReady(true);
    };
    window.addEventListener('message', receive); parent.postMessage('presenton-mobile-ready', location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => { if (ready) port.current?.postMessage({ type: 'route', route: pathname + (params.size ? '?' + params.toString() : '') }); }, [ready, pathname, params]);
  return ended ? <p className="p-6">The PC connection ended. Reconnect to inspect the original presentation.</p> : ready ? children : <p className="p-6">Opening the presentation workspace…</p>;
}
// @nimi-authority: rule.nimi.platform.ui-design-system.android-app-session
export default function MobileNimiSessionBoundary({ children }: { children: ReactNode }) {
  return window === parent ? <Entry/> : <BusinessDocument>{children}</BusinessDocument>;
}
