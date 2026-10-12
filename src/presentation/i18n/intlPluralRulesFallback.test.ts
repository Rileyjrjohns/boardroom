import { FallbackPluralRules, installPluralRulesFallback } from './intlPluralRulesFallback';

describe('FallbackPluralRules', () => {
  describe('English', () => {
    const rules = new FallbackPluralRules('en');

    it.each([
      [1, 'one'],
      [-1, 'one'],
      [0, 'other'],
      [2, 'other'],
      [1.5, 'other'],
      [21, 'other'],
      [100, 'other'],
    ] as const)('selects the category of %s', (count, expected) => {
      expect(rules.select(count)).toBe(expected);
    });
  });

  describe('French', () => {
    const rules = new FallbackPluralRules('fr');

    it.each([
      [0, 'one'],
      [1, 'one'],
      [1.5, 'one'],
      [-1, 'one'],
      [2, 'other'],
      [2.5, 'other'],
      [21, 'other'],
      [100, 'other'],
      [999_999, 'other'],
      [1_000_000, 'many'],
      [-1_000_000, 'many'],
      [2_000_000, 'many'],
      [10_000_000, 'many'],
      [1_000_001, 'other'],
      [1_500_000, 'other'],
      [1_000_000.5, 'other'],
    ] as const)('selects the category of %s', (count, expected) => {
      expect(rules.select(count)).toBe(expected);
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'selects other for the non-finite count %s',
    (count) => {
      expect(new FallbackPluralRules('fr').select(count)).toBe('other');
    },
  );

  it('reads the language from a region variant', () => {
    expect(new FallbackPluralRules('fr-CA').select(0)).toBe('one');
    expect(new FallbackPluralRules('en-GB').select(0)).toBe('other');
  });

  it('reads the first locale of a list', () => {
    expect(new FallbackPluralRules(['fr', 'en']).select(0)).toBe('one');
  });

  it('exposes the categories and the language like Intl.PluralRules does', () => {
    expect(new FallbackPluralRules('fr').resolvedOptions()).toEqual({
      locale: 'fr',
      pluralCategories: ['one', 'many', 'other'],
    });
    expect(new FallbackPluralRules('en').resolvedOptions()).toEqual({
      locale: 'en',
      pluralCategories: ['one', 'other'],
    });
  });

  it('returns a new list of categories every time, because i18next sorts it in place', () => {
    const rules = new FallbackPluralRules('fr');

    rules.resolvedOptions().pluralCategories.reverse();

    expect(rules.resolvedOptions().pluralCategories).toEqual(['one', 'many', 'other']);
  });

  // The fallback stands in for the engine's Intl.PluralRules, so a count must get the same plural
  // form with either. Compared here while the engine (Node.js) still has its own.
  describe.each(['en', 'fr'] as const)(
    'against the Intl.PluralRules of the engine in %s',
    (language) => {
      const fallback = new FallbackPluralRules(language);
      const native = new Intl.PluralRules(language);

      it('offers the same categories', () => {
        expect([...fallback.resolvedOptions().pluralCategories].sort()).toEqual(
          [...native.resolvedOptions().pluralCategories].sort(),
        );
      });

      it.each([
        0, 1, -1, 1.5, 2, 2.5, 5, 21, 100, 999_999, 1_000_000, 1_000_001, 1_500_000, 2_000_000,
        12_000_000, 1_000_000_000,
      ])('selects the same category for %s', (count) => {
        expect(fallback.select(count)).toBe(native.select(count));
      });
    },
  );

  it('accepts the cardinal type', () => {
    expect(new FallbackPluralRules('en', { type: 'cardinal' }).select(1)).toBe('one');
  });

  it.each([undefined, [], '', 'de', 'ja-JP'])('rejects the unsupported locale %j', (locales) => {
    expect(() => new FallbackPluralRules(locales)).toThrow(RangeError);
  });

  it('rejects the ordinal type', () => {
    expect(() => new FallbackPluralRules('en', { type: 'ordinal' })).toThrow(RangeError);
  });
});

describe('installPluralRulesFallback', () => {
  const nativeDescriptor = Object.getOwnPropertyDescriptor(Intl, 'PluralRules');

  afterEach(() => {
    if (nativeDescriptor) Object.defineProperty(Intl, 'PluralRules', nativeDescriptor);
  });

  it('installs the fallback when the engine has no Intl.PluralRules', () => {
    Reflect.deleteProperty(Intl, 'PluralRules');
    expect(typeof Intl.PluralRules).toBe('undefined');

    installPluralRulesFallback();

    expect(Intl.PluralRules).toBe(FallbackPluralRules);
  });

  it('never replaces an Intl.PluralRules that exists', () => {
    const native = Intl.PluralRules;

    installPluralRulesFallback();

    expect(Intl.PluralRules).toBe(native);
    expect(Intl.PluralRules).not.toBe(FallbackPluralRules);
  });

  it('can be called repeatedly', () => {
    Reflect.deleteProperty(Intl, 'PluralRules');

    installPluralRulesFallback();
    installPluralRulesFallback();

    expect(Intl.PluralRules).toBe(FallbackPluralRules);
  });
});
