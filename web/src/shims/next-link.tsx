import React, { forwardRef } from 'react';
import { useRouter } from './next-navigation';

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  replace?: boolean;
  prefetch?: boolean;
  scroll?: boolean;
};

function formatHref(href: LinkProps['href']): string {
  if (typeof href === 'string') return href;
  const pathname = href.pathname || '/';
  const query = href.query ? new URLSearchParams(href.query).toString() : '';
  return query ? `${pathname}?${query}` : pathname;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, prefetch: _prefetch, scroll: _scroll, onClick, target, ...rest },
  ref,
) {
  const router = useRouter();
  const resolvedHref = formatHref(href);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      (target && target !== '_self') ||
      rest.download !== undefined
    ) {
      return;
    }
    const parsed = new URL(resolvedHref, window.location.origin);
    if (parsed.origin !== window.location.origin) return;
    event.preventDefault();
    if (replace) router.replace(resolvedHref);
    else router.push(resolvedHref);
  };

  return <a ref={ref} href={resolvedHref} target={target} onClick={handleClick} {...rest} />;
});

export default Link;
