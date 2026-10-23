import type {
  BiometricsSecurityLevel,
  LocalAuthenticationError,
  LocalAuthenticationResult,
} from 'expo-local-authentication';

import { MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import {
  biometricCancelled,
  biometricFailed,
  biometricLockedOut,
  biometricNotEnrolled,
  biometricUnavailable,
} from '@core/domain/errors/BiometricError';
import type {
  BiometricAvailabilityError,
  BiometricError,
} from '@core/domain/errors/BiometricError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { attempt } from '@core/infrastructure/shared/attempt';
import type {
  BiometricGate,
  BiometricReason,
} from '@features/auth/application/ports/BiometricGate';

/** How long the questions about the capability (hardware, enrolment) may take. */
const DEFAULT_CAPABILITY_TIMEOUT_MILLIS = 10_000;

/**
 * Only a fingerprint or a 3D face scan opens the app and confirms a vote. On Android, `weak` would
 * also take a camera-based face unlock (a Class 2 biometric), which a photograph can fool; iOS has
 * no weak biometric, and ignores the option.
 */
const BIOMETRIC_SECURITY_LEVEL: BiometricsSecurityLevel = 'strong';

/**
 * What iOS says when `NSFaceIDUsageDescription` is missing from the build, which `expo-local-authentication`
 * returns as an error but its types do not list. Face ID cannot be asked for: it is a mistake of
 * the build, not of the user.
 */
const MISSING_USAGE_DESCRIPTION = 'missing_usage_description';

/** What the system prompt says: the reason it is shown and the label of the button that cancels. */
export interface PromptText {
  readonly message: string;
  /** The label of the cancel button of the prompt, in the language of the user. */
  readonly cancelLabel: string;
}

/** What the adapter asks of the platform: the three calls of `expo-local-authentication` it uses. */
export interface LocalAuthenticationApi {
  hasHardware(): Promise<boolean>;
  isEnrolled(): Promise<boolean>;
  authenticate(options: {
    readonly promptMessage: string;
    readonly cancelLabel: string;
    readonly disableDeviceFallback: boolean;
    readonly biometricsSecurityLevel: BiometricsSecurityLevel;
  }): Promise<LocalAuthenticationResult>;
}

export interface DeviceBiometricGateOptions {
  readonly api: LocalAuthenticationApi;
  /**
   * The text of the system prompt for a reason, in the language of the user: its message and the
   * label of its cancel button, which the system would otherwise write in its own language. The
   * adapter cannot import the presentation, where the translations are: the composition root hands
   * the function over, and it reads the current language each time it is called.
   */
  readonly promptText: (reason: BiometricReason) => PromptText;
  /** Told when the build is missing what the platform needs to ask for the biometrics. */
  readonly monitoring: Monitoring;
  /**
   * Whether the passcode of the device is accepted when the biometrics do not recognise the user.
   * A setting of the composition root: see `ALLOW_DEVICE_PASSCODE_FALLBACK` in `src/composition/container/config.ts`.
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
 * authentication is refused, never granted. The table is read by its own keys only: the name of a
 * property every object has (`constructor`, `toString`) is not a code.
 */
const ERROR_OF_OUTCOME = {
  // Not in the types of the library: see `MISSING_USAGE_DESCRIPTION`.
  [MISSING_USAGE_DESCRIPTION]: biometricUnavailable,
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
} as const satisfies Record<
  LocalAuthenticationError | typeof MISSING_USAGE_DESCRIPTION,
  () => BiometricError
>;

/**
 * The biometric check of the device, over `expo-local-authentication`. It maps every outcome of
 * the library to the biometric errors of the domain and never throws or rejects: a library that
 * throws, or does not answer a question about the capability in time, is `biometricUnavailable`,
 * which the application treats as the biometrics not being usable (it fails closed).
 *
 * The biometrics prove that a person enrolled on the device is present, not that it is the user of
 * the session. Whether the passcode of the device stands in when they fail is the setting
 * `allowDevicePasscode`. Only strong biometrics count on Android (`BIOMETRIC_SECURITY_LEVEL`), and
 * only an outcome that says `success: true` is a success. A build that lacks the usage description
 * iOS needs to ask for Face ID is `biometricUnavailable`, and is captured by the monitoring as the
 * mistake of the build it is.
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
      const { message, cancelLabel } = this.options.promptText(reason);
      // The prompt waits for the person: it has no time limit of ours, and always ends.
      const outcome = await this.options.api.authenticate({
        promptMessage: message,
        cancelLabel,
        disableDeviceFallback: !this.options.allowDevicePasscode,
        biometricsSecurityLevel: BIOMETRIC_SECURITY_LEVEL,
      });
      if (isSuccess(outcome)) return ok(undefined);

      const code = codeOf(outcome);
      const error = errorOf(code);
      if (code === MISSING_USAGE_DESCRIPTION) {
        this.options.monitoring.captureError(MONITORING_EVENT.BiometricMisconfigured, error);
      }
      return err(error);
    } catch {
      return err(biometricUnavailable());
    }
  }
}

/** Only `success: true` is a success: a value that is merely truthy is not. */
function isSuccess(outcome: unknown): boolean {
  return (
    typeof outcome === 'object' &&
    outcome !== null &&
    'success' in outcome &&
    outcome.success === true
  );
}

/** The code the library gave for a prompt that did not succeed, or `undefined` for anything else. */
function codeOf(outcome: unknown): string | undefined {
  if (typeof outcome !== 'object' || outcome === null || !('error' in outcome)) return undefined;
  return typeof outcome.error === 'string' ? outcome.error : undefined;
}

function errorOf(code: string | undefined): BiometricError {
  if (code === undefined || !Object.hasOwn(ERROR_OF_OUTCOME, code)) return biometricFailed();
  const create: () => BiometricError = ERROR_OF_OUTCOME[code as keyof typeof ERROR_OF_OUTCOME];
  return create();
}
