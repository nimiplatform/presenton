import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
export type PresentonBackendState = { key: string; origin: string; dataDirectory: string; rendererOrigin: string; exportExecutable: string };
export function readBackendState(): PresentonBackendState {
  const file = process.env.PRESENTON_BACKEND_STATE;
  if (!file) throw new Error('Presenton Host did not supply its private backend state path');
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as PresentonBackendState;
  if (!/^[0-9a-f]{64}$/.test(state.key) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin) || !path.isAbsolute(state.dataDirectory)) throw new Error('Presenton Host is unavailable');
  return state;
}
export function businessKey(headers: Headers): string {
  return headers.get('x-presenton-host') || /(?:^|;\s*)presenton_session=([^;]+)/.exec(headers.get('cookie') || '')?.[1] || '';
}
export function requireBackendState(headers: Headers): PresentonBackendState {
  const state = readBackendState();
  const provided = Buffer.from(businessKey(headers)); const expected = Buffer.from(state.key);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error('Open Presenton from Nimi');
  return state;
}
