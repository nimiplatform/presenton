import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authStatusForRequest } from '@/lib/server-auth-role';
export async function getServerAuthStatus() {
  const status = await authStatusForRequest({ headers: await headers() });
  return { ...status, available: status.authenticated };
}
export async function requireAppSession() { if (!(await getServerAuthStatus()).authenticated) redirect('/'); }
export const requireAdminSession = requireAppSession;
