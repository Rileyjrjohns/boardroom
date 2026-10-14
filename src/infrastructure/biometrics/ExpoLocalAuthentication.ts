import * as LocalAuthentication from 'expo-local-authentication';

import type { LocalAuthenticationApi } from './DeviceBiometricGate';

/**
 * The three calls of `expo-local-authentication` that the biometric gate uses, handed over as they
 * are. No logic of its own, so Jest only checks which options it passes (see the test), and the
 * prompt itself has been shown on no device.
 */
export class ExpoLocalAuthentication implements LocalAuthenticationApi {
  hasHardware(): Promise<boolean> {
    return LocalAuthentication.hasHardwareAsync();
  }

  isEnrolled(): Promise<boolean> {
    return LocalAuthentication.isEnrolledAsync();
  }

  authenticate(
    options: Parameters<LocalAuthenticationApi['authenticate']>[0],
  ): Promise<LocalAuthentication.LocalAuthenticationResult> {
    return LocalAuthentication.authenticateAsync(options);
  }
}
