import type { Adapters } from './adapters';

/** Why the composition root could not hand over a container. Plain data, like every error. */
export const CONTAINER_ERROR_CODE = {
  InvalidAdaptersSetting: 'invalidAdaptersSetting',
  ConfigurationNotAvailable: 'configurationNotAvailable',
  MockDataInvalid: 'mockDataInvalid',
} as const;

/** The environment names a way of wiring that does not exist. */
export interface InvalidAdaptersSettingError {
  readonly code: typeof CONTAINER_ERROR_CODE.InvalidAdaptersSetting;
  /** What was found, trimmed. It is configuration, not personal data. */
  readonly received: string;
}

/**
 * The configuration exists in the type system but is not wired yet: the HTTP adapters arrive with
 * authentication (step 4). It is reported, never replaced by another one.
 */
export interface ConfigurationNotAvailableError {
  readonly code: typeof CONTAINER_ERROR_CODE.ConfigurationNotAvailable;
  readonly adapters: Adapters;
}

/** The seed of the simulated server, or the session built from it, broke an invariant. */
export interface MockDataInvalidError {
  readonly code: typeof CONTAINER_ERROR_CODE.MockDataInvalid;
  readonly detail: string;
}

export type ContainerError =
  InvalidAdaptersSettingError | ConfigurationNotAvailableError | MockDataInvalidError;

export function invalidAdaptersSetting(received: string): InvalidAdaptersSettingError {
  return { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received };
}

export function configurationNotAvailable(adapters: Adapters): ConfigurationNotAvailableError {
  return { code: CONTAINER_ERROR_CODE.ConfigurationNotAvailable, adapters };
}

export function mockDataInvalid(detail: string): MockDataInvalidError {
  return { code: CONTAINER_ERROR_CODE.MockDataInvalid, detail };
}
