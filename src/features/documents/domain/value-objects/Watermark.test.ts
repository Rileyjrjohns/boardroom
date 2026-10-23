import { NOW, aUser } from '@testing/domain/builders';

import { createWatermark } from './Watermark';

describe('createWatermark', () => {
  it('carries the name and the email of the reader and the instant of the viewing, unformatted', () => {
    const reader = aUser();

    expect(createWatermark(reader, NOW)).toEqual({
      fullName: reader.fullName,
      email: reader.email,
      viewedAt: NOW,
    });
  });

  it('keeps nothing else of the reader', () => {
    expect(Object.keys(createWatermark(aUser(), NOW)).sort()).toEqual([
      'email',
      'fullName',
      'viewedAt',
    ]);
  });
});
