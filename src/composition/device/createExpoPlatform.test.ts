import { ExpoNetworkState } from '@core/infrastructure/connectivity/ExpoNetworkState';
import { ExpoSqliteOpener } from '@core/infrastructure/persistence/ExpoSqliteOpener';
import { ExpoSecureStorage } from '@core/infrastructure/secure-storage/ExpoSecureStorage';
import { ExpoLocalAuthentication } from '@features/auth/infrastructure/biometrics/ExpoLocalAuthentication';

import { createExpoPlatform } from './createExpoPlatform';

// The four native modules are empty ones in this project (jest.config.js), so all there is to check
// is that the platform is made of the wrappers over them.

describe('createExpoPlatform', () => {
  it('is made of the wrappers over the four native modules', () => {
    const platform = createExpoPlatform();

    expect(platform.databaseOpener).toBeInstanceOf(ExpoSqliteOpener);
    expect(platform.secureStorage).toBeInstanceOf(ExpoSecureStorage);
    expect(platform.localAuthentication).toBeInstanceOf(ExpoLocalAuthentication);
    expect(platform.networkState).toBeInstanceOf(ExpoNetworkState);
  });

  it('makes a platform each time, with nothing shared between two', () => {
    expect(createExpoPlatform().secureStorage).not.toBe(createExpoPlatform().secureStorage);
  });
});
