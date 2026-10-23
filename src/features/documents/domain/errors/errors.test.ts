import { valuesOf } from '@core/domain/shared/constants';

import {
  SCREEN_PROTECTION_ERROR_CODE,
  screenProtectionFailed,
  screenProtectionUnsupported,
} from './ScreenProtectionError';

describe('error factories', () => {
  it('build the screen protection errors', () => {
    expect([screenProtectionUnsupported().code, screenProtectionFailed().code]).toEqual(
      valuesOf(SCREEN_PROTECTION_ERROR_CODE),
    );
  });
});
