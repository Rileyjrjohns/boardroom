import type { DatabaseFailureReason } from '@core/infrastructure/persistence/protectedDatabase';

/** Why the composition root could not hand over a container. Plain data, like every error. */
export const CONTAINER_ERROR_CODE = {
  InvalidAdaptersSetting: 'invalidAdaptersSetting',
  MissingAdaptersSetting: 'missingAdaptersSetting',
  MissingApiBaseUrl: 'missingApiBaseUrl',
  InvalidApiBaseUrl: 'invalidApiBaseUrl',
  InsecureApiBaseUrl: 'insecureApiBaseUrl',
  InvalidRequestTimeout: 'invalidRequestTimeout',
  InvalidBiometricFallback: 'invalidBiometricFallback',
  StorageUnavailable: 'storageUnavailable',
  PlatformUnavailable: 'platformUnavailable',
  MockDataInvalid: 'mockDataInvalid',
} as const;

/** The environment names a way of wiring that does not exist. */
export interface InvalidAdaptersSettingError {
  readonly code: typeof CONTAINER_ERROR_CODE.InvalidAdaptersSetting;
  /** What was found, trimmed. It is configuration, not personal data. */
  readonly received: string;
}

/**
 * The environment names no way of wiring, outside of a development build. The mock adapters are a
 * default for development only: a release build that was not told what to talk to must not start
 * on a simulated server.
 */
export interface MissingAdaptersSettingError {
  readonly code: typeof CONTAINER_ERROR_CODE.MissingAdaptersSetting;
}

/** The real adapters need the address of the API, and the environment gives none. */
export interface MissingApiBaseUrlError {
  readonly code: typeof CONTAINER_ERROR_CODE.MissingApiBaseUrl;
}

/** The address of the API is not an `http` or `https` URL of a host, or carries more than that. */
export interface InvalidApiBaseUrlError {
  readonly code: typeof CONTAINER_ERROR_CODE.InvalidApiBaseUrl;
}

/**
 * The address of the API is `http`, in a build that is not a development one, for a host that is
 * not on this machine: the session token and the confidential content would cross the network in
 * clear.
 */
export interface InsecureApiBaseUrlError {
  readonly code: typeof CONTAINER_ERROR_CODE.InsecureApiBaseUrl;
}

/** The request timeout is not a whole number of milliseconds within the bounds the app accepts. */
export interface InvalidRequestTimeoutError {
  readonly code: typeof CONTAINER_ERROR_CODE.InvalidRequestTimeout;
}

/** The setting that says whether the device passcode is accepted is not a yes or a no. */
export interface InvalidBiometricFallbackError {
  readonly code: typeof CONTAINER_ERROR_CODE.InvalidBiometricFallback;
}

/**
 * The local database, or the key that protects it, cannot be had: the app does not start rather
 * than keep confidential data unprotected, or lose votes it could not store. `reason` says which
 * (see `DatabaseFailureReason`).
 */
export interface StorageUnavailableError {
  readonly code: typeof CONTAINER_ERROR_CODE.StorageUnavailable;
  readonly reason: DatabaseFailureReason;
}

/**
 * Something the device provides could not be loaded or set up: a native module that is missing from
 * the build, or that fails when it is used for the first time. Nothing says which: the error is
 * caught where it is thrown, and what it says (a message, a path) is not kept.
 */
export interface PlatformUnavailableError {
  readonly code: typeof CONTAINER_ERROR_CODE.PlatformUnavailable;
}

/** The seed of the simulated server, or the session built from it, broke an invariant. */
export interface MockDataInvalidError {
  readonly code: typeof CONTAINER_ERROR_CODE.MockDataInvalid;
  readonly detail: string;
}

export type ContainerError =
  | InvalidAdaptersSettingError
  | MissingAdaptersSettingError
  | MissingApiBaseUrlError
  | InvalidApiBaseUrlError
  | InsecureApiBaseUrlError
  | InvalidRequestTimeoutError
  | InvalidBiometricFallbackError
  | StorageUnavailableError
  | PlatformUnavailableError
  | MockDataInvalidError;

export function invalidAdaptersSetting(received: string): InvalidAdaptersSettingError {
  return { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received };
}

export function missingAdaptersSetting(): MissingAdaptersSettingError {
  return { code: CONTAINER_ERROR_CODE.MissingAdaptersSetting };
}

export function missingApiBaseUrl(): MissingApiBaseUrlError {
  return { code: CONTAINER_ERROR_CODE.MissingApiBaseUrl };
}

export function invalidApiBaseUrl(): InvalidApiBaseUrlError {
  return { code: CONTAINER_ERROR_CODE.InvalidApiBaseUrl };
}

export function insecureApiBaseUrl(): InsecureApiBaseUrlError {
  return { code: CONTAINER_ERROR_CODE.InsecureApiBaseUrl };
}

export function invalidRequestTimeout(): InvalidRequestTimeoutError {
  return { code: CONTAINER_ERROR_CODE.InvalidRequestTimeout };
}

export function invalidBiometricFallback(): InvalidBiometricFallbackError {
  return { code: CONTAINER_ERROR_CODE.InvalidBiometricFallback };
}

export function storageUnavailable(reason: DatabaseFailureReason): StorageUnavailableError {
  return { code: CONTAINER_ERROR_CODE.StorageUnavailable, reason };
}

export function platformUnavailable(): PlatformUnavailableError {
  return { code: CONTAINER_ERROR_CODE.PlatformUnavailable };
}

export function mockDataInvalid(detail: string): MockDataInvalidError {
  return { code: CONTAINER_ERROR_CODE.MockDataInvalid, detail };
}
