import { createNimiClient, type NimiLocalAppClient } from '@nimiplatform/sdk';
import { createNimiLocalAppStandardShellSurface } from '@nimiplatform/kit/shell/renderer/bridge';
let client: NimiLocalAppClient | undefined;
export function getNimiClient(): NimiLocalAppClient {
  return client ??= createNimiClient({ localApp: { standardShell: createNimiLocalAppStandardShellSurface() } });
}
