'use client';
import { useCallback, useEffect, useState } from 'react';
import { ModelConfigAIConfigSurface } from '@nimiplatform/kit/features/model-config';
import { openDesktopIntent } from '@nimiplatform/kit/shell/renderer/bridge';
import type { NimiAIConfigSnapshot } from '@nimiplatform/sdk/ai';
import { createNimiClientId } from '@nimiplatform/sdk/types';
import { getNimiClient } from '@/lib/nimi-client';
const APP_ID = 'io.github.nimiplatform.presenton';
const CAPABILITIES = ['text.generate', 'image.generate', 'text.embed'];

export default function NimiModelConfig() {
  const [snapshot, setSnapshot] = useState<NimiAIConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSnapshot(await getNimiClient().aiConfig.get()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <ModelConfigAIConfigSurface
    context={{ owner: 'app-ai-config', appId: APP_ID }}
    capabilityContracts={CAPABILITIES}
    capabilities={snapshot?.config ? snapshot.config.capabilities : snapshot ? null : undefined}
    revision={snapshot?.revision} effectiveSelections={snapshot?.effectiveSelections}
    loading={loading && !snapshot} loadError={error} onRetry={() => void refresh()}
    listOptions={(query) => getNimiClient().aiConfig.listOptions(query)}
    onOverwrite={async (input) => {
      const result = await getNimiClient().aiConfig.overwrite(input);
      if (result.outcome === 'committed') await refresh();
      return result;
    }}
    onOpenOwnerConfiguration={() => { void openDesktopIntent({ requestId: createNimiClientId('desktop-open'), intent: { kind: 'open-apps', appId: APP_ID, section: 'ai-models' } }); }}
    copy={{ title: 'AI models', description: 'Choose models through Nimi. Text creates and edits slides; images supply generated artwork; embeddings search icons and document notes.',
      capabilityLabel: (contract, fallback) => ({ 'text.generate': 'Writing and editing', 'image.generate': 'Generated images', 'text.embed': 'Icon and document search' }[contract] || fallback) }}
  />;
}
