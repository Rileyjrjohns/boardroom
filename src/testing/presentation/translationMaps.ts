import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import { createI18n } from '@core/presentation/i18n/createI18n';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';

// Test support, not production code: only tests import it (a lint rule enforces it).

/** Every map, with the codes it must cover. */
export type TranslationMaps = Readonly<
  Record<string, readonly [Readonly<Record<string, TranslationKey>>, readonly string[]]>
>;

/**
 * What every map from codes to translation keys must satisfy, wherever it is declared (the core and
 * each feature declare the maps of their own codes): it has an entry for every code and for nothing
 * else, a translation in every language, and its own text for each code. `sharedTexts` names the
 * maps that tell several codes with one text, on purpose, and how many codes share it.
 */
export function describeTranslationMaps(
  maps: TranslationMaps,
  sharedTexts: Readonly<Record<string, number>> = {},
): void {
  describe('the maps from codes to translation keys', () => {
    describe.each(Object.entries(maps))('%s', (name, [map, codes]) => {
      it('has an entry for every code, and for nothing else', () => {
        expect(Object.keys(map).sort()).toEqual([...codes].sort());
      });

      it.each(SUPPORTED_LANGUAGES)('has a translation in %s for every entry', (language) => {
        const { exists } = createI18n(language);

        for (const key of Object.values(map)) {
          expect(exists(key)).toBe(true);
        }
      });

      it('gives each code its own text, unless the map says two states are told the same way', () => {
        const keys = Object.values(map);
        const told = sharedTexts[name] ?? 0;

        expect(new Set(keys).size).toBe(keys.length - told);
      });
    });
  });
}
