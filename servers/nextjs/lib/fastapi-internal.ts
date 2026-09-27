import { readBackendState } from './nimi-server';
export function getFastApiBaseUrl(): string { return readBackendState().origin; }
export function getFastApiAuthHeaders(): Record<string, string> { return { 'X-Presenton-Host': readBackendState().key }; }
