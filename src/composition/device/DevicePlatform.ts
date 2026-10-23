import type { NetworkStateApi } from '@core/infrastructure/connectivity/ExpoConnectivity';
import type { DatabaseOpener } from '@core/infrastructure/persistence/DatabaseOpener';
import type { RandomBytes } from '@core/infrastructure/persistence/randomKey';
import type { SecureStorage } from '@core/infrastructure/secure-storage/SecureStorage';
import type { LocalAuthenticationApi } from '@features/auth/infrastructure/biometrics/DeviceBiometricGate';
import type { ScreenProtectionModuleApi } from '@features/documents/infrastructure/native/ScreenProtectionModuleApi';

/**
 * What the app needs from the device, as the seams the adapters are written against: the engine
 * of the local database, the secure storage, the secure random generator, the biometric prompt, the
 * state of the network and the native module that protects the screen. The composition root asks
 * for it once; a test hands over another one, made of Node's SQLite, a storage in memory, the
 * random source of Node and scripted platform answers, and runs the same wiring on it.
 */
export interface DevicePlatform {
  readonly databaseOpener: DatabaseOpener;
  readonly secureStorage: SecureStorage;
  /** Where the key of the database comes from (`expo-crypto` on a device). */
  readonly randomBytes: RandomBytes;
  readonly localAuthentication: LocalAuthenticationApi;
  readonly networkState: NetworkStateApi;
  /**
   * The native module ScreenProtection, or none: the build lacks it (a development client made
   * before it existed), or the platform has none. The screen protection of the device is built over
   * it; without it the screen cannot be protected, and says so.
   */
  readonly screenProtectionModule?: ScreenProtectionModuleApi;
}
