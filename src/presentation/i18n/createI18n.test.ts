import { DEFAULT_NAMESPACE, FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from './constants';
import { createI18n } from './createI18n';
import { RESOURCES } from './resources';
import { en } from './resources/en';
import { fr } from './resources/fr';

// A text that is not in any resource. Held in a constant, because the lint rules reject a literal
// default text in a call of `t`.
const DEFAULT_TEXT = 'Some default text';

describe('createI18n', () => {
  it('is ready as soon as it returns, so the first render is translated', () => {
    const i18n = createI18n('fr');

    expect(i18n.isInitialized).toBe(true);
    expect(i18n.t('navigation.meetings')).toBe(fr.navigation.meetings);
  });

  it.each(SUPPORTED_LANGUAGES)('starts in %s', (language) => {
    expect(createI18n(language).language).toBe(language);
  });

  it('starts in the fallback language by default', () => {
    const i18n = createI18n();

    expect(i18n.language).toBe(FALLBACK_LANGUAGE);
    expect(i18n.t('navigation.meetings')).toBe(en.navigation.meetings);
  });

  it('declares the fallback and the supported languages', () => {
    const { options } = createI18n('fr');

    expect(options.fallbackLng).toEqual([FALLBACK_LANGUAGE]);
    expect(options.supportedLngs).toEqual(expect.arrayContaining([...SUPPORTED_LANGUAGES]));
  });

  it('translates in the new language after a language change', async () => {
    const i18n = createI18n('en');

    await i18n.changeLanguage('fr');

    expect(i18n.t('navigation.meetings')).toBe(fr.navigation.meetings);
  });

  it('returns independent instances', async () => {
    const english = createI18n('en');
    const french = createI18n('fr');

    await english.changeLanguage('fr');
    await french.changeLanguage('en');

    expect(english.t('navigation.meetings')).toBe(fr.navigation.meetings);
    expect(french.t('navigation.meetings')).toBe(en.navigation.meetings);
  });

  it('types the translation keys', () => {
    const { t } = createI18n('en');

    // @ts-expect-error A key that no resource defines must fail the typecheck.
    t('does.not.exist');
    // @ts-expect-error A group of keys is not a translation.
    t('navigation');

    expect(t('app.name')).toBe(en.app.name);
  });

  it('does not let a default text switch the key check off', () => {
    const { t } = createI18n('en');

    // @ts-expect-error A default text must not make an unknown key acceptable.
    t('does.not.exist', DEFAULT_TEXT);
    // @ts-expect-error The same with the `defaultValue` option.
    t('does.not.exist', { defaultValue: DEFAULT_TEXT });

    expect(t('app.name')).toBe(en.app.name);
  });

  it('gives each instance its own resources', () => {
    const first = createI18n('fr');
    const original = first.t('app.name');
    const changed = `${original}, changed`;

    first.addResource('fr', DEFAULT_NAMESPACE, 'app.name', changed);

    expect(first.t('app.name')).toBe(changed);
    expect(createI18n('fr').t('app.name')).toBe(original);
    expect(fr.app.name).toBe(original);
    expect(RESOURCES.fr[DEFAULT_NAMESPACE].app.name).toBe(original);
  });

  it('gives each instance its own copy of a whole resource bundle', () => {
    const first = createI18n('en');

    first.addResourceBundle('en', DEFAULT_NAMESPACE, { navigation: { meetings: 'x' } }, true, true);

    expect(first.t('navigation.meetings')).toBe('x');
    expect(createI18n('en').t('navigation.meetings')).toBe(en.navigation.meetings);
    expect(en.navigation.meetings).not.toBe('x');
  });
});
