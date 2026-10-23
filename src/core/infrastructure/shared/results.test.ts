import { err, ok } from '@core/domain/shared/Result';

import { collect } from './results';

describe('collect', () => {
  it('gives the values in order when every result is a success', () => {
    expect(collect([ok(1), ok(2), ok(3)])).toStrictEqual(ok([1, 2, 3]));
  });

  it('gives an empty list for no result', () => {
    expect(collect([])).toStrictEqual(ok([]));
  });

  it('gives the first failure', () => {
    expect(collect([ok(1), err('first'), err('second')])).toStrictEqual(err('first'));
  });
});
