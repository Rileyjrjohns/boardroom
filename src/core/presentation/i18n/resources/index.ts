import { DEFAULT_NAMESPACE, type SupportedLanguage } from '../constants';

import { en } from './en';
import { fr } from './fr';
import type { TranslationResource } from './translation';

/**
 * Every resource, by language and namespace. Typed over `SupportedLanguage`, so that declaring a
 * language in `constants.ts` without translating it fails the typecheck.
 *
 * This is the shared source. i18next keeps the object it is given and writes to it (`addResource`,
 * `addResourceBundle`), so an instance never receives this object: it gets `copyResources()`.
 */
export const RESOURCES: Record<
  SupportedLanguage,
  Record<typeof DEFAULT_NAMESPACE, TranslationResource>
> = {
  en: { [DEFAULT_NAMESPACE]: en },
  fr: { [DEFAULT_NAMESPACE]: fr },
};

/**
 * A deep copy of a tree of plain objects and strings, which is all a resource is. Written by hand
 * because `structuredClone` is not available on every Hermes version.
 */
function deepCopy<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, deepCopy(child)]),
  ) as T;
}

/**
 * A private copy of `RESOURCES`. Changing it (a resource added at runtime, for instance) leaves
 * the shared source, the `en` and `fr` modules and every other instance untouched.
 */
export function copyResources(): typeof RESOURCES {
  return deepCopy(RESOURCES);
}
