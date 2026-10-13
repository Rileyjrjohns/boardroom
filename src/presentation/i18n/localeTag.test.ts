import { pickLocaleTag } from './localeTag';

describe('pickLocaleTag', () => {
  it('takes the full tag of the device when its language is the one shown', () => {
    expect(pickLocaleTag('en', ['en-GB'])).toBe('en-GB');
    expect(pickLocaleTag('fr', ['fr-CA', 'en-US'])).toBe('fr-CA');
  });

  it('takes the first tag of the device that is in the language shown, in the order of preference', () => {
    expect(pickLocaleTag('en', ['de-DE', 'en-AU', 'en-GB'])).toBe('en-AU');
  });

  it('falls back on the bare language when no tag of the device is in the language shown', () => {
    expect(pickLocaleTag('fr', ['en-GB'])).toBe('fr');
    expect(pickLocaleTag('en', [])).toBe('en');
  });

  it('does not apply the region of the device to a language that is not the device language', () => {
    // A forced French app on a device set to British English: no British French exists.
    expect(pickLocaleTag('fr', ['en-GB', 'de-DE'])).toBe('fr');
  });

  it('writes the tag in its canonical form, and accepts the underscore of some platforms', () => {
    expect(pickLocaleTag('en', ['en_gb'])).toBe('en-GB');
    expect(pickLocaleTag('en', ['  en-GB  '])).toBe('en-GB');
  });

  it('skips a tag that is malformed or not a string instead of failing', () => {
    expect(pickLocaleTag('en', ['', 'en-', null, undefined, 'en--GB', 'en-GB'])).toBe('en-GB');
    expect(pickLocaleTag('en', ['en-'])).toBe('en');
  });
});
