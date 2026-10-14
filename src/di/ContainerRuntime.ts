import type { BiometricReason } from '@application/ports/BiometricGate';
import type { Clock } from '@application/ports/Clock';
import type { Monitoring } from '@application/ports/Monitoring';
import type { ScreenProtection } from '@application/ports/ScreenProtection';
import type { PromptText } from '@infrastructure/biometrics/DeviceBiometricGate';
import type { Sleep } from '@infrastructure/clock/sleep';
import type { DevicePlatform } from '@infrastructure/device/DevicePlatform';
import type { FileStore } from '@infrastructure/files/FileStore';
import type { SentrySdk } from '@infrastructure/monitoring/SentryMonitoring';

/**
 * What the container reads from the outside world. The clock, the monitoring, the sleep and the
 * device have defaults: the clock of the device, the console, a real timer and a phone. A test
 * replaces them to control time, to run without waiting and without a phone. It is a parameter of
 * the factory and not a global: nothing here is read from a module.
 */
export interface ContainerRuntime {
  readonly clock?: Clock;
  readonly monitoring?: Monitoring;
  /**
   * The Sentry SDK, in place of the real one, for a configuration that was given an address: a test
   * hands over a stand-in that records what it is asked. Without `monitoring` and an address, the
   * monitoring is the console.
   */
  readonly sentrySdk?: SentrySdk;
  /** How the simulated latency is waited for. */
  readonly sleep?: Sleep;
  /**
   * The text of the system prompt that asks for a biometric proof, for a reason, in the language of
   * the user: what it says, and the label of its cancel button. Infrastructure cannot import the
   * translations, so the root layout hands over a function that reads them, and that reads the
   * current language each time it is called.
   */
  readonly biometricPromptText: (reason: BiometricReason) => PromptText;
  /**
   * The real device: the engine of the database, the secure storage, the random generator, the
   * biometrics, the network and the native module that protects the screen.
   */
  readonly platform?: DevicePlatform;
  /**
   * The screen protection of the app, in place of the one of the device (the native module). Tests
   * hand over the in-memory one, which they can inspect and make report a capture. Without it, both
   * configurations use the device's, which is a concern of the device and not of the backend; the
   * mock configuration falls back on the in-memory one when the build has no native module.
   */
  readonly screenProtection?: ScreenProtection;
  /**
   * Where the content of the documents is kept, in place of the folder of the app on the device
   * (the caches directory on iOS, the private storage on Android). Both configurations write the
   * downloads there, so both need it; a test hands over a store in a directory of the machine.
   */
  readonly fileStore?: FileStore;
}
