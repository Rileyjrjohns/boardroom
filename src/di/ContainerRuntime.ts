import type { BiometricReason } from '@application/ports/BiometricGate';
import type { Clock } from '@application/ports/Clock';
import type { Monitoring } from '@application/ports/Monitoring';
import type { Sleep } from '@infrastructure/clock/sleep';
import type { DevicePlatform } from '@infrastructure/device/DevicePlatform';

/**
 * What the container reads from the outside world. The clock, the monitoring, the sleep and the
 * device have defaults: the clock of the device, the console, a real timer and a phone. A test
 * replaces them to control time, to run without waiting and without a phone. It is a parameter of
 * the factory and not a global: nothing here is read from a module.
 */
export interface ContainerRuntime {
  readonly clock?: Clock;
  readonly monitoring?: Monitoring;
  /** How the simulated latency is waited for. */
  readonly sleep?: Sleep;
  /**
   * The text of the system prompt that asks for a biometric proof, for a reason, in the language of
   * the user. Infrastructure cannot import the translations, so the root layout hands over a
   * function that reads them, and that reads the current language each time it is called.
   */
  readonly biometricPromptText: (reason: BiometricReason) => string;
  /** The real device: the engine of the database, the secure storage, the biometrics, the network. */
  readonly platform?: DevicePlatform;
}
