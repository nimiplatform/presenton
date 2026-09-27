import { NextRequest, NextResponse } from 'next/server';
import { requireBackendState } from '@/lib/nimi-server';
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  try {
    const headers = new Headers(request.headers);
    const state = requireBackendState(headers);
    if (/^\/(?:api\/v[12](?:\/|$)|app_data(?:\/|$)|static(?:\/|$))/.test(pathname)) {
      headers.set('x-presenton-host', state.key);
      return NextResponse.rewrite(new URL(pathname + request.nextUrl.search, state.origin), { request: { headers } });
    }
    return NextResponse.next({ request: { headers } });
  } catch {
    return NextResponse.json({ detail: 'Presenton is not connected to Nimi. Open it from Nimi and retry.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const config = { matcher: ['/api/:path*', '/app_data/:path*', '/static/:path*', '/pdf-maker'] };
