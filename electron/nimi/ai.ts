import { createNimiLocalAppTextModel, collectNimiTextStream, type NimiGenerateTextRequest } from '@nimiplatform/sdk/ai';
import { createNimiLocalAppRuntimeScenarioJobClient } from '@nimiplatform/sdk/app';
import { runRuntimeImageGenerate } from '@nimiplatform/kit/features/generation/runtime';
import type { NimiElectronAppBusinessServices } from '@nimiplatform/kit/shell/electron/main';

const APP_ID = 'io.github.nimiplatform.presenton';
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function reviveOutput(item: any) {
  if (item.type === 'reasoning-continuity') {
    const encoded = item.carrier.payload;
    if (typeof encoded !== 'string' || !encoded) throw new Error('Invalid presentation continuity payload');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new Error('Invalid presentation continuity encoding');
    return { ...item, carrier: { ...item.carrier, payload: bytes } };
  }
  return item;
}

function serializeOutput(item: any) {
  return item.type === 'reasoning-continuity'
    ? { ...item, carrier: { ...item.carrier, payload: Buffer.from(item.carrier.payload).toString('base64') } }
    : item;
}

async function imagePart(part: any, services: NimiElectronAppBusinessServices, signal: AbortSignal) {
  const url = typeof part.url === 'string' ? part.url : '';
  const dataUrl = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s.exec(url);
  if (part.data || dataUrl) {
    const mimeType = dataUrl?.[1] ?? part.mimeType;
    if (!IMAGE_TYPES.has(mimeType)) throw new Error('Unsupported presentation input image type');
    const bytes = Buffer.from(part.data || dataUrl![2], 'base64');
    if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new Error('Invalid presentation input image size');
    const uploaded = await services.ai.artifacts.upload({ bytes, mimeType });
    signal.throwIfAborted();
    return { type: 'artifact-ref' as const, artifactId: uploaded.artifactId, mediaType: mimeType };
  }
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid presentation input image URL');
  // The public SDK validates and admits remote image inputs. Local bytes are
  // uploaded above; the worker never passes an arbitrary filesystem path.
  return { type: 'file' as const, mediaType: part.mimeType || 'image/png', data: url };
}

// @nimi-authority: rule.nimi.sdks.feature-clients.local-app-text-behaviors
export async function consumePresentationAI(
  services: NimiElectronAppBusinessServices,
  operation: string,
  payload: any,
  signal: AbortSignal,
  delta: (text: string) => void,
) {
  signal.throwIfAborted();
  if (operation === 'text') {
    const messages = [];
    for (const message of payload.messages) {
      if (message.role === 'assistant') {
        messages.push({ role: 'assistant', content: [], turnItems: message.outputItems.map((output: any) => ({ type: 'output', output: reviveOutput(output) })) });
      } else if (message.role === 'tool') {
        messages.push({ role: 'tool', content: [], turnItems: [{ type: 'tool-result', toolResult: message.toolResult }] });
      } else {
        const content = [];
        for (const part of message.content) content.push(part.type === 'image' ? await imagePart(part, services, signal) : part);
        messages.push({ role: message.role, content });
      }
    }
    const model = createNimiLocalAppTextModel(services.ai, { executionMode: 'sync' });
    const input = { messages, tools: payload.tools, toolChoice: payload.toolChoice,
      responseFormat: payload.responseFormat, parameters: payload.parameters, signal } as NimiGenerateTextRequest;
    const events = await model.streamText!(input);
    async function* observe() {
      for await (const event of events) {
        signal.throwIfAborted();
        if (event.type === 'text-delta') delta(event.text);
        yield event;
      }
    }
    const result = await collectNimiTextStream(observe());
    signal.throwIfAborted();
    return { text: result.text, toolCalls: result.toolCalls ?? [],
      outputItems: (result.outputItems ?? []).map(serializeOutput), finishReason: result.finishReason };
  }
  if (operation === 'embed') {
    if (payload.purpose !== 'retrieval-document' && payload.purpose !== 'retrieval-query') throw new Error('Invalid embedding retrieval purpose');
    const result = await services.ai.scenario.execute({ type: 'text-embed', inputs: payload.inputs, purpose: payload.purpose }, { signal });
    if (result.output.type !== 'text-embed' || !result.output.spaceId) throw new Error('Nimi returned no valid embedding space');
    return result.output;
  }
  if (operation === 'image') {
    const result = await runRuntimeImageGenerate({
      runtime: { ai: createNimiLocalAppRuntimeScenarioJobClient(services.ai) },
      appId: APP_ID, prompt: payload.prompt, count: 1,
      scenarioId: 'presentation-image', surfaceId: 'presenton', signal,
    });
    if (!result.ok) throw result.error;
    signal.throwIfAborted();
    const artifact = result.output.firstArtifact;
    if (!artifact?.artifactId) throw new Error('Nimi image generation returned no owned artifact');
    const image = await services.ai.artifacts.read(artifact.artifactId);
    signal.throwIfAborted();
    if (!IMAGE_TYPES.has(image.mimeType) || !image.sizeBytes) throw new Error('Nimi returned an invalid image');
    return { data: Buffer.from(image.bytes).toString('base64'), mimeType: image.mimeType };
  }
  throw new Error('Unknown Presenton AI operation');
}
