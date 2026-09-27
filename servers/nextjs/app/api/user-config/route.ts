import { NextResponse } from 'next/server';
import { requireBackendState } from '@/lib/nimi-server';
async function forward(request: Request, method: 'GET' | 'PUT') {
  try {
    const state = requireBackendState(request.headers);
    const response = await fetch(`${state.origin}/api/v1/ppt/business-settings`, { method,
      headers: { 'X-Presenton-Host': state.key, 'Content-Type': 'application/json' },
      ...(method === 'PUT' ? { body: await request.text() } : {}), cache: 'no-store' });
    return new NextResponse(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  } catch { return NextResponse.json({ detail: 'Presenton Host unavailable' }, { status: 401 }); }
}
export const GET = (request: Request) => forward(request, 'GET');
export const POST = (request: Request) => forward(request, 'PUT');
