import { resolveDevelopmentRealm } from '@nimiplatform/app-tools/development';
export const MOBILE_UI_ORIGIN = 'https://127.0.0.1:4486';
export const MOBILE_PACKAGE = 'ai.nimi.apps.presenton.dev';
export function readMobileAccess() {
  const realm = resolveDevelopmentRealm();
  if (realm.name !== 'local') throw new Error('Presenton Android currently has only a local development source. Select --realm local.');
  return {
    appId: 'io.github.nimiplatform.presenton', clientId: 'io.github.nimiplatform.presenton.android.dev',
    realmEnvironmentId: realm.environmentId, realmBaseUrl: realm.apiOrigin, officialWebBaseUrl: realm.webOrigin,
    redirectUri: `${MOBILE_PACKAGE}:/oauth/callback`,
  };
}
