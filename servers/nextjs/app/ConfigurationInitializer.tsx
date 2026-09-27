"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { useDispatch } from 'react-redux';
import { setCanChangeKeys, setLLMConfig } from '@/store/slices/userConfig';
import { Button } from '@/components/ui/button';
export function ConfigurationInitializer({ children }: { children: ReactNode }) {
  const dispatch = useDispatch(); const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''); const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    fetch('/api/user-config', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Presenton settings could not be loaded. Retry after connecting to Nimi.');
      const settings = await response.json();
      if (active) { dispatch(setCanChangeKeys(true)); dispatch(setLLMConfig({ ...settings, LLM: 'nimi' })); setLoaded(true); setError(''); }
    }).catch((cause) => { if (active) setError(String(cause.message || cause)); });
    return () => { active = false; };
  }, [attempt, dispatch]);
  if (loaded) return children;
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4" role="status">
    <p>{error || 'Loading Presenton…'}</p>{error && <Button onClick={() => retry((value) => value + 1)}>Retry</Button>}
  </main>;
}
