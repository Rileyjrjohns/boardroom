import { SUPPORTED_LANGUAGES } from '../constants';

import { en } from './en';
import { fr } from './fr';
import { RESOURCES } from './index';
import type { TranslationResource } from './translation';

const PLACEHOLDER = /\{\{[^}]+\}\}/g;

/** Flattens a resource to `'group.key': 'value'` entries, the way i18next addresses them. */
function flatten(resource: object, prefix = ''): Record<string, string> {
  return Object.entries(resource).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'string'
      ? { ...flat, [path]: value }
      : { ...flat, ...flatten(value as object, path) };
  }, {});
}

const english = flatten(en);
const french = flatten(fr);

describe('translation resources', () => {
  it('defines a resource for every supported language', () => {
    expect(Object.keys(RESOURCES).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('has the same keys in French as in English', () => {
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(Object.entries(english))('translates %s without leaving it empty', (key, value) => {
    expect(value.trim()).not.toBe('');
    expect(french[key]?.trim()).not.toBe('');
  });

  it.each(Object.entries(english))(
    'uses the same placeholders for %s in both languages',
    (key, value) => {
      expect(french[key]?.match(PLACEHOLDER)?.sort()).toEqual(value.match(PLACEHOLDER)?.sort());
    },
  );

  it('types a language resource against the English one', () => {
    // @ts-expect-error A key missing from a resource must fail the typecheck.
    const missingKey: TranslationResource = { ...fr, placeholder: {} };
    const extraKey: TranslationResource = {
      ...fr,
      // @ts-expect-error A key that the English resource does not define must fail the typecheck.
      unknown: 'value',
    };

    expect(missingKey).toBeDefined();
    expect(extraKey).toBeDefined();
  });
});
