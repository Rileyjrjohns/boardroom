import type { SupportedLanguage } from './constants';
import { primaryLanguageSubtag } from './languageTag';
import { findSupportedLanguage } from './resolveLanguage';

/**
 * Why this file exists: i18next (since v24, no fallback left) resolves plural forms through the
 * global `Intl.PluralRules`, and Hermes does not implement it. Without it, every language would be
 * stuck with the English rule "one if the count is 1, other otherwise", which is wrong for French
 * ("0 réunion", "1,5 réunion").
 *
 * The usual answer is the `intl-pluralrules` polyfill. This is the same idea without a new
 * dependency, limited to the cardinal rules of the supported languages. It only installs itself
 * when the engine has no `Intl.PluralRules`, so an engine that has one (Node.js, a future Hermes)
 * keeps using its own.
 *
 * Rules are the CLDR cardinal rules, with the same categories as the engines that implement them,
 * so that a count gets the same plural form whatever the engine (`plurals.test.ts` checks it).
 */

type PluralCategory = 'one' | 'many' | 'other';

/** Integer part of the absolute value, as CLDR names it `i`. */
function integerPart(count: number): number {
  return Math.floor(Math.abs(count));
}

/** French counts exact multiples of this as `many` ("1 000 000 de réunions"). */
const FRENCH_MANY_DIVISOR = 1_000_000;

const CARDINAL_RULES: Record<SupportedLanguage, (count: number) => PluralCategory> = {
  // one: i = 1 and v = 0
  en: (count) => (Math.abs(count) === 1 ? 'one' : 'other'),
  fr: (count) => {
    // one: i = 0,1 (so 0, 1 and 1.5 are singular)
    if (integerPart(count) <= 1) return 'one';
    // many: i != 0 and i % 1000000 = 0 and v = 0 (a whole number, no visible decimals)
    if (Number.isInteger(count) && integerPart(count) % FRENCH_MANY_DIVISOR === 0) return 'many';
    return 'other';
  },
};

const CATEGORIES: Record<SupportedLanguage, readonly PluralCategory[]> = {
  en: ['one', 'other'],
  fr: ['one', 'many', 'other'],
};

/** The subset of `Intl.PluralRules` that i18next relies on. */
export class FallbackPluralRules {
  private readonly language: SupportedLanguage;

  public constructor(locales?: string | readonly string[], options?: Intl.PluralRulesOptions) {
    const [requested] = typeof locales === 'string' ? [locales] : (locales ?? []);
    const language = findSupportedLanguage(primaryLanguageSubtag(requested ?? ''));
    if (language === undefined) {
      throw new RangeError(`Unsupported locale for the plural rules fallback: ${requested}`);
    }
    if (options?.type === 'ordinal') {
      throw new RangeError('Ordinal plural rules are not supported by the fallback.');
    }
    this.language = language;
  }

  public select(count: number): PluralCategory {
    return Number.isFinite(count) ? CARDINAL_RULES[this.language](count) : 'other';
  }

  public resolvedOptions(): Pick<Intl.ResolvedPluralRulesOptions, 'locale' | 'pluralCategories'> {
    // A new array on every call: i18next sorts the result in place.
    return { locale: this.language, pluralCategories: [...CATEGORIES[this.language]] };
  }
}

/**
 * Installs the fallback as `Intl.PluralRules` when the engine has none. Safe to call any number of
 * times: it never replaces an implementation that exists.
 */
export function installPluralRulesFallback(): void {
  if (typeof Intl.PluralRules === 'function') return;
  Object.defineProperty(Intl, 'PluralRules', {
    value: FallbackPluralRules,
    configurable: true,
    writable: true,
  });
}
