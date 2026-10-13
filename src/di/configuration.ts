import { findConstant, valuesOf } from '@domain/shared/constants';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { durationFromMillis } from '@domain/value-objects/Duration';
import type { Duration } from '@domain/value-objects/Duration';
import { API_BASE_URL_ERROR, parseApiBaseUrl } from '@infrastructure/http/apiBaseUrl';

import { ADAPTERS } from './adapters';
import {
  ALLOW_DEVICE_PASSCODE_FALLBACK,
  HTTP_REQUEST_TIMEOUT,
  MAX_HTTP_REQUEST_TIMEOUT,
  MIN_HTTP_REQUEST_TIMEOUT,
  MOCK_SESSION_LIFETIME,
  MOCK_STARTS_SIGNED_IN,
  SIMULATED_LATENCY,
} from './config';
import {
  insecureApiBaseUrl,
  invalidAdaptersSetting,
  invalidApiBaseUrl,
  invalidBiometricFallback,
  invalidRequestTimeout,
  missingAdaptersSetting,
  missingApiBaseUrl,
} from './errors';
import type { ContainerError } from './errors';

/** The app against the simulated server and the in-memory adapters. */
export interface MockConfiguration {
  readonly kind: typeof ADAPTERS.Mock;
  /** Whether the demo user is signed in at start. Named, so that the day it goes away is visible. */
  readonly startSignedIn: boolean;
  /** How long the simulated server takes to answer. */
  readonly latency: Duration;
  /** How long a session of the simulated server lasts, from the sign-in. */
  readonly sessionLifetime: Duration;
}

/** The app against the real adapters: the HTTP API, SQLite, the secure storage and the device. */
export interface HttpConfiguration {
  readonly kind: typeof ADAPTERS.Http;
  /** The address of the API: `https`, or `http` for the machine itself, with no trailing slash. */
  readonly baseUrl: string;
  /** How long a request may take before it counts as a network failure. */
  readonly requestTimeout: Duration;
  /** Whether the passcode of the device is accepted when the biometrics fail. */
  readonly allowDevicePasscode: boolean;
}

/** How the app is wired. A discriminated union: add a member, and the compiler lists every switch to extend. */
export type Configuration = MockConfiguration | HttpConfiguration;

/** The configuration used when nothing is said: the mock one, with the values of `config.ts`. */
export function defaultMockConfiguration(): MockConfiguration {
  return {
    kind: ADAPTERS.Mock,
    startSignedIn: MOCK_STARTS_SIGNED_IN,
    latency: SIMULATED_LATENCY,
    sessionLifetime: MOCK_SESSION_LIFETIME,
  };
}

/** What the composition root is told about the build it runs in. */
export interface BuildEnvironment {
  /**
   * Whether this is a development build. Told by the root layout, which reads it from the
   * platform: the composition root reads nothing itself.
   */
  readonly development: boolean;
}

/**
 * The settings the root layout reads from the environment, raw, and passes on: `di` reads nothing
 * itself. Every one of them is validated here, in `parseConfiguration`, and nowhere else.
 */
export interface RawSettings {
  /** `EXPO_PUBLIC_BOARDROOM_ADAPTERS`: `mock` or `http`. */
  readonly adapters: string | undefined;
  /** `EXPO_PUBLIC_BOARDROOM_API_BASE_URL`: where the API is. Required for `http`, ignored by `mock`. */
  readonly apiBaseUrl: string | undefined;
  /** Starts the mock configuration signed in as the demo user. */
  readonly mockStartsSignedIn?: boolean;
  /**
   * The values of `config.ts` that the real configuration takes, replaced: for the tests of their
   * validation, and for a build that needs another one. The request timeout is in milliseconds.
   */
  readonly requestTimeoutMillis?: unknown;
  readonly allowDevicePasscode?: unknown;
}

/**
 * Turns the settings of the environment into a configuration. A missing or blank adapters setting
 * is the mock configuration in a development build, where the simulated server is the sensible
 * default, and an error everywhere else (`missingAdaptersSetting`): a release build must be told
 * what it talks to, and must not start on a simulated server because someone forgot a variable.
 * The value is trimmed and its case ignored. Anything else that is not a known way of wiring is an
 * error, not a silent fallback: a typo must not start the demo against the wrong thing.
 *
 * The real configuration needs the address of the API (`missingApiBaseUrl`, `invalidApiBaseUrl`,
 * and `insecureApiBaseUrl` for `http` outside a development build, except for this machine), a
 * request timeout within bounds and a yes or no for the passcode fallback. Each is an error with a
 * code of its own, so that the screen of a failed start says what to fix.
 */
export function parseConfiguration(
  settings: RawSettings,
  environment: BuildEnvironment,
): Result<Configuration, ContainerError> {
  const setting = (settings.adapters ?? '').trim();
  if (setting === '') {
    return environment.development
      ? ok(mockConfiguration(settings))
      : err(missingAdaptersSetting());
  }

  const adapters = findConstant(valuesOf(ADAPTERS), setting.toLowerCase());
  switch (adapters) {
    case ADAPTERS.Mock:
      return ok(mockConfiguration(settings));
    case ADAPTERS.Http:
      return parseHttpConfiguration(settings, environment);
    case undefined:
      return err(invalidAdaptersSetting(setting));
  }
}

function mockConfiguration(settings: RawSettings): MockConfiguration {
  return {
    ...defaultMockConfiguration(),
    ...(settings.mockStartsSignedIn === undefined
      ? {}
      : { startSignedIn: settings.mockStartsSignedIn }),
  };
}

function parseHttpConfiguration(
  settings: RawSettings,
  environment: BuildEnvironment,
): Result<HttpConfiguration, ContainerError> {
  const baseUrl = parseApiBaseUrl(settings.apiBaseUrl, environment);
  if (!baseUrl.ok) {
    switch (baseUrl.error) {
      case API_BASE_URL_ERROR.Missing:
        return err(missingApiBaseUrl());
      case API_BASE_URL_ERROR.Malformed:
        return err(invalidApiBaseUrl());
      case API_BASE_URL_ERROR.Insecure:
        return err(insecureApiBaseUrl());
    }
  }

  const requestTimeout =
    settings.requestTimeoutMillis === undefined
      ? ok(HTTP_REQUEST_TIMEOUT)
      : timeoutOf(settings.requestTimeoutMillis);
  if (!requestTimeout.ok) return requestTimeout;

  const allowDevicePasscode =
    settings.allowDevicePasscode === undefined
      ? ALLOW_DEVICE_PASSCODE_FALLBACK
      : settings.allowDevicePasscode;
  if (typeof allowDevicePasscode !== 'boolean') return err(invalidBiometricFallback());

  return ok({
    kind: ADAPTERS.Http,
    baseUrl: baseUrl.value,
    requestTimeout: requestTimeout.value,
    allowDevicePasscode,
  });
}

function timeoutOf(millis: unknown): Result<Duration, ContainerError> {
  const duration = typeof millis === 'number' ? durationFromMillis(millis) : undefined;
  return duration?.ok === true &&
    duration.value >= MIN_HTTP_REQUEST_TIMEOUT &&
    duration.value <= MAX_HTTP_REQUEST_TIMEOUT
    ? duration
    : err(invalidRequestTimeout());
}
