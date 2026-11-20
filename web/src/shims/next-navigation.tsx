import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type LocationSnapshot = {
  pathname: string;
  search: string;
};

function readLocation(): LocationSnapshot {
  if (typeof window === 'undefined') return { pathname: '/dashboard', search: '' };
  return { pathname: window.location.pathname || '/', search: window.location.search || '' };
}

const RouterContext = createContext<{
  location: LocationSnapshot;
  navigate: (href: string, replace?: boolean) => void;
} | null>(null);

export class SpaNotFoundError extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'SpaNotFoundError';
  }
}

export class SpaRedirectError extends Error {
  readonly destination: string;
  constructor(destination: string) {
    super(`NEXT_REDIRECT:${destination}`);
    this.name = 'SpaRedirectError';
    this.destination = destination;
  }
}

export function SpaRouterProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LocationSnapshot>(readLocation);

  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((href: string, replace = false) => {
    const resolved = new URL(href, window.location.origin);
    if (resolved.origin !== window.location.origin) {
      if (replace) window.location.replace(resolved.href);
      else window.location.assign(resolved.href);
      return;
    }
    const nextUrl = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    if (replace) window.history.replaceState(null, '', nextUrl);
    else window.history.pushState(null, '', nextUrl);
    setLocation({ pathname: resolved.pathname, search: resolved.search });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function usePathname(): string {
  const ctx = useContext(RouterContext);
  return ctx ? ctx.location.pathname : readLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const ctx = useContext(RouterContext);
  const search = ctx ? ctx.location.search : readLocation().search;
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  return useMemo(() => ({
    push(href: string) {
      if (ctx) ctx.navigate(href, false);
      else window.location.assign(href);
    },
    replace(href: string) {
      if (ctx) ctx.navigate(href, true);
      else window.location.replace(href);
    },
    back() {
      window.history.back();
    },
    forward() {
      window.history.forward();
    },
    refresh() {
      if (ctx) ctx.navigate(`${window.location.pathname}${window.location.search}${window.location.hash}`, true);
    },
    prefetch() {
      return Promise.resolve();
    },
  }), [ctx]);
}

export function redirect(href: string): never {
  throw new SpaRedirectError(href);
}

export function notFound(): never {
  throw new SpaNotFoundError();
}
