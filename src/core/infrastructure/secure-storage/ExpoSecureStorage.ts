import * as SecureStore from 'expo-secure-store';

import type { SecureStorage } from './SecureStorage';

/** The service the items are filed under in the keychain: the app, not the module's default. */
const KEYCHAIN_SERVICE = 'boardroom';

/**
 * Where a secret may be read and by whom. On iOS: only while the device is unlocked, and only on
 * this device, so it is neither synchronised through iCloud Keychain nor restored from a backup
 * onto another device. Android ignores the option: its items live in preferences encrypted with a
 * key of the Android Keystore, in the app's private storage, and backups are off for the app
 * (`android.allowBackup` is false).
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

/**
 * The secure storage of the device, over `expo-secure-store`. As thin as it can be: it renames the
 * calls and turns `null` into `undefined`. Its logic is none, so Jest only checks which options it
 * passes (see the test), and the keychain itself has been run on no device.
 */
export class ExpoSecureStorage implements SecureStorage {
  async get(key: string): Promise<string | undefined> {
    return (await SecureStore.getItemAsync(key, OPTIONS)) ?? undefined;
  }

  set(key: string, value: string): Promise<void> {
    return SecureStore.setItemAsync(key, value, OPTIONS);
  }

  remove(key: string): Promise<void> {
    return SecureStore.deleteItemAsync(key, OPTIONS);
  }
}
