export const SCREEN_PROTECTION_ERROR_CODE = {
  Unsupported: 'screenProtectionUnsupported',
  Failed: 'screenProtectionFailed',
} as const;

/** The platform cannot block screenshots and screen recording. */
export interface ScreenProtectionUnsupportedError {
  readonly code: typeof SCREEN_PROTECTION_ERROR_CODE.Unsupported;
}

/** The platform could do it, but turning the protection on or off failed. */
export interface ScreenProtectionFailedError {
  readonly code: typeof SCREEN_PROTECTION_ERROR_CODE.Failed;
}

export type ScreenProtectionError = ScreenProtectionUnsupportedError | ScreenProtectionFailedError;

export function screenProtectionUnsupported(): ScreenProtectionUnsupportedError {
  return { code: SCREEN_PROTECTION_ERROR_CODE.Unsupported };
}

export function screenProtectionFailed(): ScreenProtectionFailedError {
  return { code: SCREEN_PROTECTION_ERROR_CODE.Failed };
}
