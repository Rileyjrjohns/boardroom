import { ExpoLocalAuthentication } from '../biometrics/ExpoLocalAuthentication';
import { ExpoNetworkState } from '../connectivity/ExpoNetworkState';
import { loadScreenProtectionModule } from '../native/loadScreenProtectionModule';
import { expoRandomBytes } from '../persistence/ExpoRandomBytes';
import { ExpoSqliteOpener } from '../persistence/ExpoSqliteOpener';
import { ExpoSecureStorage } from '../secure-storage/ExpoSecureStorage';

import type { DevicePlatform } from './DevicePlatform';

/**
 * The device of a phone: `expo-sqlite` (built with SQLCipher), `expo-secure-store`, `expo-crypto`
 * for the random bytes of the key, `expo-local-authentication`, `expo-network` and the local module
 * ScreenProtection.
 *
 * The wrappers import their native modules like any other import, so they are loaded with the
 * app. A module that is missing from the build or fails when it loads is then a failure of the
 * start, not of this function; a failure when the wrappers are made is caught by the composition
 * root (`platformUnavailable`). The one exception is ScreenProtection, which is loaded as an
 * optional module: a build without it is a platform that cannot protect the screen, and says so
 * when asked to (see `NativeScreenProtection`). In Jest the Expo modules and ScreenProtection are
 * empty ones (see `jest.config.js`).
 */
export function createExpoPlatform(): DevicePlatform {
  const screenProtectionModule = loadScreenProtectionModule();
  return {
    databaseOpener: new ExpoSqliteOpener(),
    secureStorage: new ExpoSecureStorage(),
    randomBytes: expoRandomBytes,
    localAuthentication: new ExpoLocalAuthentication(),
    networkState: new ExpoNetworkState(),
    ...(screenProtectionModule === undefined ? {} : { screenProtectionModule }),
  };
}
