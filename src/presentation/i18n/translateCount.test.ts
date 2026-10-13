import { SUPPORTED_LANGUAGES } from './constants';
import { createI18n } from './createI18n';
import { en } from './resources/en';
import { fr } from './resources/fr';
import { translateCount, type PluralKey } from './translateCount';

const COUNT_PLACEHOLDER = '{{formattedCount}}';

const plain = (value: number): string => String(value);

describe('translateCount', () => {
  it.each(SUPPORTED_LANGUAGES)('translates the plural key for a count in %s', (language) => {
    const { t } = createI18n(language);

    expect(translateCount(t, 'meeting.pageCount', 1, plain)).toBe(
      t('meeting.pageCount', { count: 1, formattedCount: '1' }),
    );
    expect(translateCount(t, 'meeting.pageCount', 2, plain)).toBe(
      t('meeting.pageCount', { count: 2, formattedCount: '2' }),
    );
  });

  it('uses the plural form of the language', () => {
    const english = createI18n('en');
    const french = createI18n('fr');

    // Zero is singular in French and plural in English.
    expect(translateCount(french.t, 'meeting.pageCount', 0, plain)).toBe(
      fr.meeting.pageCount_one.replace(COUNT_PLACEHOLDER, '0'),
    );
    expect(translateCount(english.t, 'meeting.pageCount', 0, plain)).toBe(
      en.meeting.pageCount_other.replace(COUNT_PLACEHOLDER, '0'),
    );
  });

  it('writes the count the way it is told to, not as the raw number', () => {
    const english = createI18n('en');
    const french = createI18n('fr');
    const grouped = (value: number): string => value.toLocaleString('en-US');

    expect(translateCount(english.t, 'meeting.pageCount', 12_345, grouped)).toBe('12,345 pages');
    expect(translateCount(french.t, 'meeting.pageCount', 12_345, grouped)).toBe('12,345 pages');
    expect(translateCount(french.t, 'meeting.pageCount', 1_000_000, plain)).toBe(
      '1000000 de pages',
    );
  });

  it('only accepts a number as count and a plural key', () => {
    const { t } = createI18n('en');

    // @ts-expect-error A count read from a route parameter is a string: parse it first.
    translateCount(t, 'meeting.pageCount', '1', plain);
    // @ts-expect-error A key without plural forms is not a plural key.
    translateCount(t, 'navigation.meetings', 1, plain);
    // @ts-expect-error A key that no resource defines.
    translateCount(t, 'does.not.exist', 1, plain);

    const key: PluralKey = 'meeting.pageCount';
    expect(translateCount(t, key, 1, plain)).toBe('1 page');
  });

  it('is needed: t alone renders the raw key when the count is not a number', () => {
    const { t } = createI18n('fr');
    // `t` accepts any value for a parameter that its resource does not type. This is a string
    // that has gone through a cast, like a route parameter would.
    const fromRoute = JSON.parse('"1"') as number;

    expect(t('meeting.pageCount', { count: fromRoute, formattedCount: '1' })).toBe(
      'meeting.pageCount',
    );
    expect(t('meeting.pageCount', { count: Number(fromRoute), formattedCount: '1' })).not.toBe(
      'meeting.pageCount',
    );
  });
});
