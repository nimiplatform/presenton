'use client';
import { NimiAccountControl, useNimiAppSession } from '@nimiplatform/kit/auth/app';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@nimiplatform/kit/ui';

export default function RemoteAccountHeader() {
  const { snapshot } = useNimiAppSession();
  const account = snapshot.identity.status === 'signed-in' ? snapshot.identity.user?.displayName || 'Nimi account' : '';
  const pc = snapshot.runtime.status === 'connected' ? snapshot.runtime.displayName || 'PC workspace' : 'PC workspace';
  return <header className="sticky top-0 z-[70] flex h-[45px] items-center justify-between gap-3 border-b bg-white px-3 text-sm sm:px-4">
    <span className="min-w-0 truncate">Presenton <span className="text-slate-500">· {pc}</span></span>
    {account && <Popover><PopoverTrigger asChild><Button size="sm" tone="secondary" aria-label="Nimi account" className="max-w-40 shrink-0 truncate">{account}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-w-[calc(100vw-1rem)] p-3 [&>div]:flex-wrap [&_span]:max-w-full [&_span]:break-words"><NimiAccountControl hideSignedOut language="en"/></PopoverContent>
    </Popover>}
  </header>;
}
