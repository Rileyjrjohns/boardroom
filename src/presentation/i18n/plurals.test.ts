import { createInstance } from 'i18next';

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './constants';
import { createI18n } from './createI18n';
import { FallbackPluralRules } from './intlPluralRulesFallback';
import { RESOURCES } from './resources';
import { en } from './resources/en';
import { fr } from './resources/fr';

// The pluralised key `meeting.pageCount` proves the whole plural pipeline before a real feature
// relies on it. Each case runs twice: with the Intl.PluralRules of the engine (Node.js here) and
// without it, like on Hermes, where the fallback of intlPluralRulesFallback.ts takes over.

type Category = 'one' | 'many' | 'other';

const PLURAL_FORMS: Record<SupportedLanguage, Record<Category, string>> = {
  en: {
    one: en.meeting.pageCount_one,
    many: en.meeting.pageCount_many,
    other: en.meeting.pageCount_other,
  },
  fr: {
    one: fr.meeting.pageCount_one,
    many: fr.meeting.pageCount_many,
    other: fr.meeting.pageCount_other,
  },
};

/**
 * The category each language selects for a count. French counts 0 and 1.5 as singular, and exact
 * multiples of one million as `many`, which an engine with its own Intl.PluralRules selects too.
 * English has no `many`.
 */
const EXPECTED_CATEGORIES: Record<SupportedLanguage, readonly (readonly [number, Category])[]> = {
  en: [
    [0, 'other'],
    [1, 'one'],
    [2, 'other'],
    [1.5, 'other'],
    [21, 'other'],
    [1_000_000, 'other'],
  ],
  fr: [
    [0, 'one'],
    [1, 'one'],
    [2, 'other'],
    [1.5, 'one'],
    [21, 'other'],
    [999_999, 'other'],
    [1_000_000, 'many'],
    [2_000_000, 'many'],
    [1_500_000, 'other'],
  ],
};

const nativeDescriptor = Object.getOwnPropertyDescriptor(Intl, 'PluralRules');

afterEach(() => {
  if (nativeDescriptor) Object.defineProperty(Intl, 'PluralRules', nativeDescriptor);
});

describe.each([
  ['an engine with Intl.PluralRules', false],
  ['an engine without Intl.PluralRules (Hermes)', true],
] as const)('plurals on %s', (_name, withoutNativeRules) => {
  beforeEach(() => {
    if (withoutNativeRules) Reflect.deleteProperty(Intl, 'PluralRules');
  });

  it('resolves the plural forms with the expected implementation', () => {
    createI18n('fr');

    if (withoutNativeRules) {
      expect(Intl.PluralRules).toBe(FallbackPluralRules);
    } else {
      expect(Intl.PluralRules).toBe(nativeDescriptor?.value);
    }
  });

  describe.each(SUPPORTED_LANGUAGES)('in %s', (language) => {
    it.each(EXPECTED_CATEGORIES[language])('uses the right form for %s', (count, category) => {
      const { t } = createI18n(language);

      expect(t('meeting.pageCount', { count })).toBe(
        PLURAL_FORMS[language][category].replace('{{count}}', String(count)),
      );
    });
  });

  it('never falls back to the English text in French, for the counts where the two differ', () => {
    const english = createI18n('en');
    const french = createI18n('fr');

    // "page" is the same word in both languages, so the texts only differ where the plural forms
    // do: zero and a fraction are singular in French, a multiple of a million takes "de".
    for (const count of [0, 1.5, 1_000_000, 2_000_000]) {
      expect(french.t('meeting.pageCount', { count })).not.toBe(
        english.t('meeting.pageCount', { count }),
      );
    }
  });

  it('pluralises French and English differently for zero', () => {
    expect(createI18n('en').t('meeting.pageCount', { count: 0 })).not.toBe(
      createI18n('fr').t('meeting.pageCount', { count: 0 }),
    );
    expect(createI18n('fr').t('meeting.pageCount', { count: 0 })).toContain(
      PLURAL_FORMS.fr.one.replace('{{count}}', '0'),
    );
  });
});

describe('why the fallback exists', () => {
  it('shows i18next alone pluralising French like English on an engine without Intl.PluralRules', async () => {
    Reflect.deleteProperty(Intl, 'PluralRules');
    const bare = createInstance();
    await bare.init({ lng: 'fr', resources: RESOURCES, initAsync: false });

    // "0 page" is the correct French. Without Intl.PluralRules, i18next gives "0 pages".
    expect(bare.t('meeting.pageCount', { count: 0 })).toContain(
      PLURAL_FORMS.fr.other.replace('{{count}}', '0'),
    );
  });
});
