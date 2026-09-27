'use client';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import NimiModelConfig from '@/components/NimiModelConfig';
import OnboardingPresentonAccount from '@/components/OnBoarding/OnboardingPresentonAccount';
import { Button } from '@/components/ui/button';
import { setLLMConfig } from '@/store/slices/userConfig';
import type { LLMConfig } from '@/types/llm_config';
import WebSearchProvider from './WebSearchProvider';

export default function SettingsPage() {
  const dispatch = useDispatch();
  const [section, setSection] = useState('models');
  const [settings, setSettings] = useState<LLMConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/user-config', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load presentation settings.');
      setSettings(await response.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/user-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Settings could not be saved.');
      dispatch(setLLMConfig({ ...result, LLM: 'nimi' })); setMessage('Settings saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  const source = settings.DISABLE_IMAGE_GENERATION ? 'disabled' : settings.IMAGE_PROVIDER || 'nimi';
  return <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
    <h1 className="font-syne text-3xl text-[#191919]">Settings</h1>
    <p className="mt-3 max-w-2xl text-base text-[#525252]">Manage your AI models in Nimi and choose the services used by your presentations.</p>
    <nav className="mt-8 flex flex-wrap gap-2 border-b border-[#EDEEEF] pb-4" aria-label="Settings sections">
      {Object.entries({ models: 'AI models', images: 'Images', search: 'Web search', community: 'Community account' }).map(([key, label]) =>
        <Button key={key} variant={section === key ? 'default' : 'outline'} onClick={() => setSection(key)} aria-pressed={section === key}>{label}</Button>)}
    </nav>
    <section className="min-w-0 py-8">
      {section === 'models' && <NimiModelConfig />}
      {section === 'community' && <div className="max-w-2xl space-y-5"><h2 className="font-syne text-xl">Presenton Community</h2><p className="text-[#525252]">Connecting this optional account enables Presenton Cloud community services. AI generation uses your Nimi models.</p><OnboardingPresentonAccount variant="settings" /></div>}
      {['images', 'search'].includes(section) && (loading ? <p role="status">Loading settings…</p> : <div className="max-w-2xl space-y-6">
        {section === 'images' && <>
          <div className="space-y-2"><label htmlFor="image-source" className="block font-medium">Slide images</label>
            <select id="image-source" value={source} className="min-h-11 w-full rounded-lg border border-[#D1D5DB] bg-white px-3" onChange={(event) => setSettings((current) => ({ ...current, DISABLE_IMAGE_GENERATION: event.target.value === 'disabled', ...(event.target.value !== 'disabled' ? { IMAGE_PROVIDER: event.target.value } : {}) }))}>
              <option value="nimi">Generate with Nimi</option><option value="pexels">Search Pexels stock photos</option><option value="pixabay">Search Pixabay stock photos</option><option value="disabled">Use placeholders</option>
            </select><p className="text-sm text-[#525252]">Nimi images use the image model selected in AI models. Stock photo services require their own account keys.</p></div>
          {['pexels', 'pixabay'].includes(source) && <div className="space-y-2"><label htmlFor="stock-key" className="block font-medium">{source === 'pexels' ? 'Pexels' : 'Pixabay'} API key</label><input id="stock-key" type="password" autoComplete="off" className="min-h-11 w-full rounded-lg border border-[#D1D5DB] px-3" value={String(settings[source === 'pexels' ? 'PEXELS_API_KEY' : 'PIXABAY_API_KEY'] || '')} onChange={(event) => setSettings((current) => ({ ...current, [source === 'pexels' ? 'PEXELS_API_KEY' : 'PIXABAY_API_KEY']: event.target.value }))} /></div>}
        </>}
        {section === 'search' && <WebSearchProvider llmConfig={settings} setLlmConfig={setSettings} />}
        <div className="flex flex-wrap items-center gap-4"><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save settings'}</Button><Button variant="outline" onClick={() => void load()}>Reload</Button><p role="status" className="text-sm text-[#525252]">{message}</p></div>
      </div>)}
    </section>
  </main>;
}
