import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from './constants';
import { findSupportedLanguage, resolveLanguage } from './resolveLanguage';

describe('resolveLanguage', () => {
  it.each(SUPPORTED_LANGUAGES)('returns %s for a device set to that language', (language) => {
    expect(resolveLanguage([language])).toBe(language);
  });

  it.each([
    ['fr-CA', 'fr'],
    ['fr-FR', 'fr'],
    ['fr-BE', 'fr'],
    ['en-GB', 'en'],
    ['en-US', 'en'],
    ['fr-Latn-CA', 'fr'],
  ] as const)('maps the regional variant %s to %s', (languageTag, expected) => {
    expect(resolveLanguage([languageTag])).toBe(expected);
  });

  it.each([
    ['FR-ca', 'fr'],
    ['fr_CA', 'fr'],
    ['EN_gb', 'en'],
  ] as const)('tolerates the casing and the separator of %s', (languageTag, expected) => {
    expect(resolveLanguage([languageTag])).toBe(expected);
  });

  it('falls back for an unsupported language', () => {
    expect(resolveLanguage(['de-DE'])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage(['ja'])).toBe(FALLBACK_LANGUAGE);
  });

  it('does not mistake a longer language code for a supported one', () => {
    expect(resolveLanguage(['fil-PH'])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage(['enm'])).toBe(FALLBACK_LANGUAGE);
  });

  it('falls back when there is no locale at all', () => {
    expect(resolveLanguage([])).toBe(FALLBACK_LANGUAGE);
  });

  it('falls back for an empty or malformed tag', () => {
    expect(resolveLanguage([''])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage(['-FR'])).toBe(FALLBACK_LANGUAGE);
  });

  it('skips an entry that is not a string and keeps looking', () => {
    expect(resolveLanguage([undefined])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage([null])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage([null, 'fr'])).toBe('fr');
    expect(resolveLanguage([undefined, 'de-DE', null, 'fr-CA'])).toBe('fr');
  });

  it('does not crash on a value of another type that a native module could return', () => {
    const malformed = [42, {}, [], true] as unknown as string[];

    expect(resolveLanguage(malformed)).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage([...malformed, 'fr'])).toBe('fr');
  });

  it('ignores the whitespace around a tag', () => {
    expect(resolveLanguage([' fr'])).toBe('fr');
    expect(resolveLanguage(['fr '])).toBe('fr');
    expect(resolveLanguage(['  en-GB\n'])).toBe('en');
    expect(resolveLanguage(['   '])).toBe(FALLBACK_LANGUAGE);
  });

  it('honours the order of preference of the user', () => {
    expect(resolveLanguage(['fr-CA', 'en-US'])).toBe('fr');
    expect(resolveLanguage(['en-GB', 'fr-FR'])).toBe('en');
  });

  it('skips the unsupported languages that come first', () => {
    expect(resolveLanguage(['de-DE', 'ja-JP', 'fr-FR'])).toBe('fr');
  });
});

describe('findSupportedLanguage', () => {
  it('finds a supported language by its code', () => {
    expect(findSupportedLanguage('fr')).toBe('fr');
  });

  it('returns undefined for an unsupported code', () => {
    expect(findSupportedLanguage('de')).toBeUndefined();
  });

  it('does not accept a region or a different casing', () => {
    expect(findSupportedLanguage('fr-CA')).toBeUndefined();
    expect(findSupportedLanguage('FR')).toBeUndefined();
  });
});
