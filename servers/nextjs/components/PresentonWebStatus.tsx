'use client';
import { useEffect, useState } from 'react';
import { invokeShell } from '@nimiplatform/kit/shell/renderer/bridge';

export default function PresentonWebStatus() {
  const [status, setStatus] = useState({ registered:false, error:'', transferNote:'' });
  useEffect(() => {
    let active=true;
    void invokeShell<typeof status>('presenton.web.status', {}).then(value=>{if(active)setStatus(value);})
      .catch(error=>{if(active)setStatus({registered:false,error:String(error.message||error),transferNote:''});});
    return()=>{active=false;};
  }, []);
  return <section className="mt-6 rounded-lg border p-4" aria-live="polite"><h2 className="font-medium">Browser access</h2>
    <p className="mt-1 text-sm">{status.registered?'This PC workspace is registered. Keep Presenton open, sign in from the browser, then allow that source in Nimi Home → Integrations.':'The PC workspace is not available to browser clients yet.'}</p>
    {status.error&&<p className="mt-2 break-words text-sm text-red-700">{status.error}</p>}
    {status.transferNote&&<details className="mt-2 text-sm"><summary>Connection details</summary><p className="mt-2 break-words">{status.transferNote}</p></details>}
  </section>;
}
