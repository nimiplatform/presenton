"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { invokeShell } from '@nimiplatform/kit/shell/renderer/bridge';
import { Button } from '@/components/ui/button';
import { getNimiClient } from '@/lib/nimi-client';
export default function NimiSessionBoundary({ children }: { children: ReactNode }) {
  const path = usePathname(); const exporting = path === '/pdf-maker';
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Connecting to Nimi…');
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (exporting) return;
    let active = true; let pending = false;
    const refresh = async () => {
      if (pending) return; pending = true;
      try {
        const auth = await getNimiClient().auth.status();
        if (!auth.sessionBound) {
          if (active) { setReady(false); setMessage(`${auth.reasonCode} · ${auth.actionHint}`); } return;
        }
        const backend = await invokeShell<{ ready: boolean; message: string }>('presenton.backend.status', {});
        if (active) { setReady(backend.ready); setMessage(backend.message); }
      } catch (error) {
        if (active) { setReady(false); setMessage(error instanceof Error ? error.message : String(error)); }
      } finally { pending = false; }
    };
    void refresh(); const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [attempt, exporting]);
  if (exporting || ready) return children;
  return <main className="flex min-h-screen items-center justify-center bg-white p-8">
    <section className="w-full max-w-xl space-y-5" aria-live="polite">
      <h1 className="font-syne text-3xl text-[#191919]">Open Presenton with Nimi</h1>
      <p className="text-base text-[#525252]">Nimi authorizes this App and supplies its AI models. Keep Nimi open while you create and edit presentations.</p>
      <p className="break-words text-sm text-[#525252]">{message}</p>
      <Button onClick={() => { void invokeShell('presenton.backend.retry', {}).catch((error) => setMessage(String(error.message || error))).finally(() => retry((value) => value + 1)); }}>Retry connection</Button>
    </section>
  </main>;
}
