/** Opaque sandbox frames cannot receive the owning page's service-worker messages.
 * Read their PC assets in the already-authorized parent, then give the frame bytes only. */
export async function inlineWebSlideAssets(document: string, origin: string, signal: AbortSignal): Promise<string> {
  const assetSlots = /\b(?:src|srcset|href|poster)\s*=\s*["'][^"']*["']|url\(\s*(?:"[^"]*"|'[^']*'|[^)"']*)\s*\)/gi;
  const candidates = new Set((document.match(assetSlots) ?? []).flatMap(slot =>
    slot.match(/(?:https?:\/\/[^\s"'<>/]+)?\/(?:app_data|static)\/[^\s"'<>)]*/g) ?? []));
  const replacements = await Promise.all([...candidates].map(async raw => {
    const url = new URL(raw.replaceAll('&amp;', '&'), origin);
    if (url.origin !== origin) throw new Error('This slide refers to a different PC asset origin. Replace that asset in the editor.');
    const response = await fetch(url.href, { signal });
    if (!response.ok) throw new Error('A slide asset could not be read from your PC. Reconnect and reopen the slide.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    let binary = '';
    for (let offset=0;offset<bytes.length;offset+=8192) binary += String.fromCharCode(...bytes.subarray(offset,offset+8192));
    const mime = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    return [raw, `data:${mime};base64,${btoa(binary)}`] as const;
  }));
  signal.throwIfAborted();
  // Longest first avoids replacing a URL prefix shared by a longer asset name.
  replacements.sort((a,b)=>b[0].length-a[0].length);
  return document.replace(assetSlots, slot => {
    for (const [source, value] of replacements) slot=slot.replaceAll(source,value);
    return slot;
  });
}
