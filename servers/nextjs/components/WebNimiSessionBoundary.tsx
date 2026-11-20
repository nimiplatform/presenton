'use client';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createWebNimiAppSession } from '@nimiplatform/kit/auth/app/web';
import { NimiAppAccessGate, NimiAppSessionProvider, type NimiAppScope } from '@nimiplatform/kit/auth/app';
import { NimiThemeProvider, TooltipProvider } from '@nimiplatform/kit/ui';
import { connectWebWorkspace } from '@/lib/web-workspace';
import RemoteAccountHeader from './RemoteAccountHeader';

// @nimi-authority: rule.nimi.platform.ui-design-system.remote-app-session
export default function WebNimiSessionBoundary({children}:{children:ReactNode}){
  const [session,setSession]=useState<ReturnType<typeof createWebNimiAppSession>>();
  const firstScope=useRef<NimiAppScope|null>(null);
  useEffect(()=>{const session=createWebNimiAppSession(JSON.parse(process.env.NEXT_PUBLIC_NIMI_WEB_CONFIG!));setSession(session);void session.start();return()=>session.dispose();},[]);
  if(!session)return <p className="p-8">Connecting to Nimi…</p>;
  return <NimiThemeProvider accentPack="nimi-accent"><TooltipProvider><NimiAppSessionProvider session={session}>
    <div style={{'--presenton-shell-bar':'45px'} as CSSProperties}><RemoteAccountHeader/>
    <NimiAppAccessGate externalAccountControl title="Presenton" language="en">{scope=>{
      if(!firstScope.current)firstScope.current=scope;
      return firstScope.current!==scope ? <section className="m-auto max-w-xl space-y-4 p-8"><h1 className="text-xl">Reconnect your presentation workspace</h1><p>The previous connection ended. Check the original PC task before retrying unfinished work. Reload to use the current connection.</p><button className="rounded border px-4 py-2" onClick={()=>location.reload()}>Reload Presenton</button></section> : <PCWorkspace scope={scope}>{children}</PCWorkspace>;
    }}</NimiAppAccessGate></div>
  </NimiAppSessionProvider></TooltipProvider></NimiThemeProvider>;
}
function PCWorkspace({scope,children}:{scope:NimiAppScope;children:ReactNode}){
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let disposed=false,close:(()=>void)|undefined;setReady(false);setError('');
    void connectWebWorkspace(scope).then(stop=>{if(disposed){stop();return;}close=stop;setReady(true);}).catch(cause=>{if(!disposed)setError(String(cause.message||cause));});
    return()=>{disposed=true;close?.();};},[scope,attempt]);
  if(ready)return children;
  return <main className="m-auto max-w-xl space-y-4 p-8" aria-live="polite"><h1 className="text-2xl">Connect to your PC presentations</h1>
    <p>Create, edit and export from the Presenton workspace on your PC. Keep Nimi and Presenton open there. AI models and service credentials are managed in PC Settings.</p>
    <p className="break-words">{error||'Connecting to the PC workspace…'}</p>{error&&<button className="rounded border px-4 py-2" onClick={()=>setAttempt(value=>value+1)}>Retry PC connection</button>}</main>;
}
