import type { LocalAuthenticationApi } from '../biometrics/DeviceBiometricGate';
import type { NetworkStateApi } from '../connectivity/ExpoConnectivity';
import type { DatabaseOpener } from '../persistence/DatabaseOpener';
import type { SecureStorage } from '../secure-storage/SecureStorage';

/**
 * What the app needs from the device, as the seams the adapters are written against: the engine
 * of the local database, the secure storage, the biometric prompt and the state of the network.
 * The composition root asks for it once; a test hands over another one, made of Node's SQLite, a
 * storage in memory and scripted platform answers, and runs the same wiring on it.
 */
export interface DevicePlatform {
  readonly databaseOpener: DatabaseOpener;
  readonly secureStorage: SecureStorage;
  readonly localAuthentication: LocalAuthenticationApi;
  readonly networkState: NetworkStateApi;
}
