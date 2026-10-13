import type {
  LocalAuthenticationError,
  LocalAuthenticationResult,
} from 'expo-local-authentication';

import {
  biometricCancelled,
  biometricFailed,
  biometricLockedOut,
  biometricNotEnrolled,
  biometricUnavailable,
} from '@domain/errors/BiometricError';
import type { BiometricAvailabilityError, BiometricError } from '@domain/errors/BiometricError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { BiometricGate, BiometricReason } from '@application/ports/BiometricGate';

import { attempt } from '../shared/attempt';

/** How long the questions about the capability (hardware, enrolment) may take. */
const DEFAULT_CAPABILITY_TIMEOUT_MILLIS = 10_000;

/** What the adapter asks of the platform: the three calls of `expo-local-authentication` it uses. */
export interface LocalAuthenticationApi {
  hasHardware(): Promise<boolean>;
  isEnrolled(): Promise<boolean>;
  authenticate(options: {
    readonly promptMessage: string;
    readonly disableDeviceFallback: boolean;
  }): Promise<LocalAuthenticationResult>;
}

export interface DeviceBiometricGateOptions {
  readonly api: LocalAuthenticationApi;
  /**
   * The text of the system prompt for a reason, in the language of the user. The adapter cannot
   * import the presentation, where the translations are: the composition root hands the function
   * over, and it reads the current language each time it is called.
   */
  readonly promptText: (reason: BiometricReason) => string;
  /**
   * Whether the passcode of the device is accepted when the biometrics do not recognise the user.
   * A setting of the composition root: see `ALLOW_DEVICE_PASSCODE_FALLBACK` in `src/di/config.ts`.
   */
  readonly allowDevicePasscode: boolean;
  /** Defaults to `DEFAULT_CAPABILITY_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/**
 * What the library says when a prompt did not succeed, mapped to the biometric errors of the
 * domain. Typed over every code of the library, so that a code added by an update of it fails the
 * typecheck here instead of being treated as something it is not. A code the library sends that is
 * not in the table at run time (a newer library than the types) is `biometricFailed`: the
 * authentication is refused, never granted.
 */
const ERROR_OF_OUTCOME = {
  authentication_failed: biometricFailed,
  unable_to_process: biometricFailed,
  unknown: biometricFailed,
  lockout: biometricLockedOut,
  not_enrolled: biometricNotEnrolled,
  not_available: biometricUnavailable,
  passcode_not_set: biometricUnavailable,
  no_space: biometricUnavailable,
  invalid_context: biometricUnavailable,
  user_cancel: biometricCancelled,
  app_cancel: biometricCancelled,
  system_cancel: biometricCancelled,
  user_fallback: biometricCancelled,
  timeout: biometricCancelled,
} as const satisfies Record<LocalAuthenticationError, () => BiometricError>;

/**
 * The biometric check of the device, over `expo-local-authentication`. It maps every outcome of
 * the library to the biometric errors of the domain and never throws or rejects: a library that
 * throws, or does not answer a question about the capability in time, is `biometricUnavailable`,
 * which the application treats as the biometrics not being usable (it fails closed).
 *
 * The biometrics prove that a person enrolled on the device is present, not that it is the user of
 * the session. Whether the passcode of the device stands in when they fail is the setting
 * `allowDevicePasscode`.
 */
export class DeviceBiometricGate implements BiometricGate {
  constructor(private readonly options: DeviceBiometricGateOptions) {}

  async checkAvailability(): Promise<Result<void, BiometricAvailabilityError>> {
    const { api } = this.options;
    const timeout = this.options.timeoutMillis ?? DEFAULT_CAPABILITY_TIMEOUT_MILLIS;

    const hardware = await attempt(() => api.hasHardware(), timeout);
    if (!hardware.ok || !hardware.value) return err(biometricUnavailable());

    const enrolled = await attempt(() => api.isEnrolled(), timeout);
    if (!enrolled.ok) return err(biometricUnavailable());
    return enrolled.value ? ok(undefined) : err(biometricNotEnrolled());
  }

  async authenticate(reason: BiometricReason): Promise<Result<void, BiometricError>> {
    try {
      // The prompt waits for the person: it has no time limit of ours, and always ends.
      const outcome = await this.options.api.authenticate({
        promptMessage: this.options.promptText(reason),
        disableDeviceFallback: !this.options.allowDevicePasscode,
      });
      return outcome.success ? ok(undefined) : err(errorOf(outcome.error));
    } catch {
      return err(biometricUnavailable());
    }
  }
}

function errorOf(outcome: LocalAuthenticationError): BiometricError {
  const create: (() => BiometricError) | undefined = ERROR_OF_OUTCOME[outcome];
  return (create ?? biometricFailed)();
}
