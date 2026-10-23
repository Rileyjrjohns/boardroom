import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';

import { documentsRetryableCodes } from './retryableCodes';

describe('the codes of the documents a second try can fix', () => {
  it('are a screen protection that failed, and no other', () => {
    expect([...documentsRetryableCodes]).toEqual([SCREEN_PROTECTION_ERROR_CODE.Failed]);
  });

  it('leave out a platform that cannot protect a screen at all', () => {
    expect(documentsRetryableCodes.has(SCREEN_PROTECTION_ERROR_CODE.Unsupported)).toBe(false);
  });
});
