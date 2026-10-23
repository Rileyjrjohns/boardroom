# 0011. Internationalisation from the first screen, with typed keys and no magic strings

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md), [0008](0008-result-type-instead-of-exceptions.md)

## Context

The board is mixed and bilingual, and the app shows text that matters (why a vote was refused, that a copy is saved data, that local data was reset). Translating an app after the fact means finding every literal, rewriting layouts that assumed English lengths and plurals, and living with strings that nobody can grep. Domain and application code carries no text at all, so the translation has to happen in one place, the presentation.

## Decision

Every user-facing text goes through i18n from the first screen, in English and French (English is the fallback and the source of truth for the keys).

- i18next, react-i18next and expo-localization, with an explicit `I18nProvider` over an instance made by `createI18n()`: no global instance, no work at import time, a private copy of the resources per instance.
- Keys are typed from the English resource (`strictKeyChecks`): an unknown key, a default text next to a key, and a French resource with a missing or extra key all fail `npm run typecheck`. Counts go through `translateCount`, which accepts a plural key and a number only.
- Errors are codes without text. Typed maps over the whole set of codes (`i18n/translationKeys.ts`) turn each code into a key, so a code without a text fails the typecheck.
- Lint rejects, in `app/` and the presentation folders, a string literal as a JSX child, in a prop that reads like a text, in the option objects of navigation, in `Alert` and announcements, a raw colour and a raw `testID`. Colours, spacing and sizes are theme tokens, test ids are constants, business codes are const objects.
- Repository tests pin what a type cannot: `deadCode.test.ts` fails on a translation key or a design token that nothing uses, and the French resource is checked for typography (no-break space before `:;?!`), for text left in English, and for wording that would address a user by gender.
- The language follows the device and the per-app language settings (`expo-localization` plugin); the Face ID usage text is localised through `locales/fr.json`. Hermes has no `Intl.PluralRules`, so `intlPluralRulesFallback.ts` supplies the cardinal rules of the supported languages when the engine has none.

## Consequences

- Adding a language is a short list of steps in [the conventions](../conventions.md#adding-a-language), and the typecheck asks for the ones that are forgotten.
- A screen cannot ship a hardcoded sentence without the lint failing, and a translation cannot drift from the English shape.
- The rules have limits that a selector cannot see (a text held in a variable, a prop with an unusual name, numbers), which [the conventions](../conventions.md#what-it-cannot-catch) list and leave to review.
- More ceremony for the first screen, and a lint configuration that has its own tests. The price is paid once.
- Plurals on Hermes are a maintained piece of code of our own. `intl-pluralrules` is the better answer if more languages or ordinals are needed.

## Alternatives considered

- **Add i18n later.** Cheaper at first and a costly retrofit; the typed keys and the lint rules have the most value when they exist before the strings do.
- **Untyped keys.** Faster to write, and a typo shows a raw key to the user.
- **ICU messages with FormatJS or Lingui.** Strong tooling for extraction and ICU plurals; i18next with typed keys was enough for two languages and kept one library for both formatting and loading.
- **`Intl` formatting only, with English strings in the code.** Leaves the sentences untranslated.
