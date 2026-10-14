import { z } from 'zod';

import { issuePathsOf } from './issuePaths';

describe('issuePathsOf', () => {
  const schema = z.object({ a: z.string(), list: z.array(z.object({ n: z.number() })) });

  it('lists the paths of the flaws, sorted, without repeats, and no value', () => {
    const parsed = schema.safeParse({ a: 1, list: [{ n: 'x' }, { n: 2 }, { n: 'y' }] });

    expect(parsed.success).toBe(false);
    expect(!parsed.success && issuePathsOf(parsed.error)).toBe('a,list.0.n,list.2.n');
  });

  it('says $ for a payload that is wrong as a whole', () => {
    const parsed = schema.safeParse('text');

    expect(!parsed.success && issuePathsOf(parsed.error)).toBe('$');
  });

  it('lists at most ten paths', () => {
    const wide = z.object(
      Object.fromEntries(Array.from({ length: 15 }, (_x, number) => [`f${number}`, z.string()])),
    );
    const parsed = wide.safeParse({});

    expect(!parsed.success && issuePathsOf(parsed.error).split(',')).toHaveLength(10);
  });
});
