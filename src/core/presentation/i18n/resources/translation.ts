import type { en } from './en';

/**
 * The shape every language resource must have: the nested keys of the English resource, each
 * holding a string. A resource typed with it fails the typecheck when a key is missing or
 * unknown, and `as const` on the English object is what lets i18next read the literal keys.
 */
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

export type TranslationResource = Shape<typeof en>;
