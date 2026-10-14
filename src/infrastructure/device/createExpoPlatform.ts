import { ExpoLocalAuthentication } from '../biometrics/ExpoLocalAuthentication';
import { ExpoNetworkState } from '../connectivity/ExpoNetworkState';
import { ExpoSqliteOpener } from '../persistence/ExpoSqliteOpener';
import { ExpoSecureStorage } from '../secure-storage/ExpoSecureStorage';

import type { DevicePlatform } from './DevicePlatform';

/**
 * The device of a phone: `expo-sqlite` (built with SQLCipher), `expo-secure-store`,
 * `expo-local-authentication` and `expo-network`.
 *
 * The wrappers import their native modules like any other import, so they are loaded with the
 * app. A module that is missing from the build or fails when it loads is then a failure of the
 * start, not of this function; a failure when the wrappers are made is caught by the composition
 * root (`platformUnavailable`). In Jest the four modules are empty ones (see `jest.config.js`).
 */
export function createExpoPlatform(): DevicePlatform {
  return {
    databaseOpener: new ExpoSqliteOpener(),
    secureStorage: new ExpoSecureStorage(),
    localAuthentication: new ExpoLocalAuthentication(),
    networkState: new ExpoNetworkState(),
  };
}
