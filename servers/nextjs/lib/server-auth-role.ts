import { NextResponse } from 'next/server';
import { requireBackendState } from './nimi-server';
export type ServerAuthStatus = { configured: boolean; authenticated: boolean; username: string | null; user_id: string | null; role: 'admin' | 'user' | null };
export async function authStatusForRequest(request: Pick<Request, 'headers'>): Promise<ServerAuthStatus> {
  try {
    const state = requireBackendState(request.headers);
    const response = await fetch(`${state.origin}/api/v1/auth/status`, { headers: { 'X-Presenton-Host': state.key }, cache: 'no-store' });
    if (!response.ok) throw new Error('Presenton backend unavailable');
    return response.json();
  } catch { return { configured: true, authenticated: false, username: null, user_id: null, role: null }; }
}
export async function requireAdminApi(request: Request): Promise<NextResponse | null> {
  return (await authStatusForRequest(request)).authenticated ? null : NextResponse.json({ detail: 'Open Presenton from Nimi' }, { status: 401 });
}
