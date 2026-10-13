import { createExpoPlatform } from './createExpoPlatform';

// The native modules cannot be loaded in Jest, so the four are replaced by empty ones: all there is
// to check is that the platform is made of the wrappers over them, and that making it loads them.
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
jest.mock('expo-local-authentication', () => ({}));
jest.mock('expo-network', () => ({}));

describe('createExpoPlatform', () => {
  it('is made of the wrappers over the four native modules', () => {
    const platform = createExpoPlatform();

    expect(platform.databaseOpener.constructor.name).toBe('ExpoSqliteOpener');
    expect(platform.secureStorage.constructor.name).toBe('ExpoSecureStorage');
    expect(platform.localAuthentication.hasHardware).toEqual(expect.any(Function));
    expect(platform.networkState.getState).toEqual(expect.any(Function));
  });
});
