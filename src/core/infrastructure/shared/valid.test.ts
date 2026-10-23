import { err, ok } from '@core/domain/shared/Result';

import { InvalidStaticValueError, valid } from './valid';

describe('valid', () => {
  it('gives the value of a success', () => {
    expect(valid(ok(42))).toBe(42);
  });

  it('throws, naming what was wrong, on a failure: static data that is invalid is a bug', () => {
    expect(() => valid(err({ code: 'broken' }))).toThrow(InvalidStaticValueError);
    expect(() => valid(err({ code: 'broken' }))).toThrow('broken');
  });
});
