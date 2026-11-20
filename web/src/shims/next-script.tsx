import { useEffect } from 'react';

type ScriptProps = {
  id?: string;
  src?: string;
  strategy?: string;
  onLoad?: () => void;
  onReady?: () => void;
  onError?: () => void;
};

export default function Script({ id, src, onLoad, onReady, onError }: ScriptProps) {
  useEffect(() => {
    if (!src || typeof document === 'undefined') return;
    const selector = id ? `script#${CSS.escape(id)}` : `script[src="${CSS.escape(src)}"]`;
    const existing = document.querySelector<HTMLScriptElement>(selector);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        onReady?.();
      } else {
        const done = () => { existing.dataset.loaded = 'true'; onLoad?.(); onReady?.(); };
        existing.addEventListener('load', done, { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    if (id) script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      onLoad?.();
      onReady?.();
    }, { once: true });
    if (onError) script.addEventListener('error', () => onError(), { once: true });
    document.head.appendChild(script);
  }, [id, onError, onLoad, onReady, src]);

  return null;
}
