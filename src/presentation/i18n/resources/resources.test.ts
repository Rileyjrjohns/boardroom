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

// The French values that are, rightly, the same as the English ones: a word that both languages
// write alike, or a text made only of placeholders. Any other equal value is an untranslated text.
const SAME_IN_BOTH_LANGUAGES = [
  'meeting.agendaItem', // Only placeholders and a full stop.
  'meeting.documents', // "Documents" in both.
  'meeting.participants', // "Participants" in both.
  'meeting.pageCount_one', // "page" in both.
  'meeting.pageCount_other', // "pages" in both.
  'confidentiality.public', // "Public" in both.
  'app.name', // The name of the app, a brand, is not translated.
];

// French puts a no-break space before a colon, a semicolon, a question mark and an exclamation
// mark, so that the sign never starts a line. A plain space, or none, is wrong.
const NO_BREAK_SPACE = '\u00a0';
const UNSPACED_SIGN = /(?<!\u00a0)[:;?!]/;

// What the user reads when the server says no: if these were left in English, the French user
// would be told in a language they chose not to use.
const CRITICAL_FRENCH_TEXTS = {
  'states.staleData': 'Affichage des données enregistrées le {{date}}',
  'states.retry': 'Réessayer',
  'states.refreshing': 'Actualisation en cours',
  'errors.unauthorized': 'Votre session n’est plus valide. Reconnectez-vous.',
  'errors.networkUnavailable': 'Le serveur est injoignable. Vérifiez votre connexion et réessayez.',
  'errors.appLocked': 'L’application est verrouillée. Déverrouillez-la pour continuer.',
  'votingState.windowOver': 'Délai écoulé',
} as const;

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

  describe('the French resource', () => {
    it.each(Object.entries(french))('is not the English text left as it was: %s', (key, value) => {
      if (SAME_IN_BOTH_LANGUAGES.includes(key)) {
        expect(value).toBe(english[key]);
      } else {
        expect(value).not.toBe(english[key]);
      }
    });

    it('lists only keys that exist, in its allow-list of identical texts', () => {
      for (const key of SAME_IN_BOTH_LANGUAGES) {
        expect(Object.keys(french)).toContain(key);
      }
    });

    it.each(Object.entries(CRITICAL_FRENCH_TEXTS))('says %s in French', (key, text) => {
      expect(french[key]).toBe(text);
    });

    it.each(Object.entries(french))(
      'puts a no-break space before every colon, semicolon, question and exclamation mark: %s',
      (_key, value) => {
        expect(value).not.toMatch(UNSPACED_SIGN);
      },
    );

    it('does use the no-break space where it has a colon', () => {
      expect(french['meeting.resolutionYourVote']).toContain(`${NO_BREAK_SPACE}:`);
      expect(french['startup.code']).toContain(`${NO_BREAK_SPACE}:`);
    });
  });

  it('types a language resource against the English one', () => {
    // @ts-expect-error A key missing from a resource must fail the typecheck.
    const missingKey: TranslationResource = { ...fr, navigation: {} };
    const extraKey: TranslationResource = {
      ...fr,
      // @ts-expect-error A key that the English resource does not define must fail the typecheck.
      unknown: 'value',
    };

    expect(missingKey).toBeDefined();
    expect(extraKey).toBeDefined();
  });
});
