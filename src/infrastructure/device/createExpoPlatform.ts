import type { ExpoLocalAuthentication } from '../biometrics/ExpoLocalAuthentication';
import type { ExpoNetworkState } from '../connectivity/ExpoNetworkState';
import type { ExpoSqliteOpener } from '../persistence/ExpoSqliteOpener';
import type { ExpoSecureStorage } from '../secure-storage/ExpoSecureStorage';

import type { DevicePlatform } from './DevicePlatform';

/**
 * The device of a phone: `expo-sqlite` (built with SQLCipher), `expo-secure-store`,
 * `expo-local-authentication` and `expo-network`.
 *
 * The wrappers are loaded when the platform is made, not when this file is: each of them imports a
 * native module, which does not exist anywhere but on a device (or in a test of the wrapper that
 * replaces it). Nothing that does not ask for a real device, the mock configuration and every test
 * of the composition root among them, loads a native module. That is why these are `require` calls
 * made late, with a literal path that Metro bundles like an import, and not imports at the top.
 */
export function createExpoPlatform(): DevicePlatform {
  /* eslint-disable @typescript-eslint/no-require-imports -- loaded late on purpose, see above. */
  const { ExpoSqliteOpener: SqliteOpener } = require('../persistence/ExpoSqliteOpener') as {
    ExpoSqliteOpener: new () => ExpoSqliteOpener;
  };
  const { ExpoSecureStorage: SecureStorage } = require('../secure-storage/ExpoSecureStorage') as {
    ExpoSecureStorage: new () => ExpoSecureStorage;
  };
  const { ExpoLocalAuthentication: LocalAuthentication } =
    require('../biometrics/ExpoLocalAuthentication') as {
      ExpoLocalAuthentication: new () => ExpoLocalAuthentication;
    };
  const { ExpoNetworkState: NetworkState } = require('../connectivity/ExpoNetworkState') as {
    ExpoNetworkState: new () => ExpoNetworkState;
  };
  /* eslint-enable @typescript-eslint/no-require-imports */

  return {
    databaseOpener: new SqliteOpener(),
    secureStorage: new SecureStorage(),
    localAuthentication: new LocalAuthentication(),
    networkState: new NetworkState(),
  };
}
