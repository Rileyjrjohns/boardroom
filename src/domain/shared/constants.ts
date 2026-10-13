/** The union of the values of a const object: `ValueOf<typeof VOTE_CHOICE>` is `'for' | ...`. */
export type ValueOf<C> = C[keyof C];

/**
 * The values of a const object, typed as the union they form. `Object.values` widens them to
 * `string`, hence the assertion, which is safe because the parameter is the const object itself.
 */
export function valuesOf<C extends Readonly<Record<string, string>>>(
  constants: C,
): readonly ValueOf<C>[] {
  return Object.values(constants) as ValueOf<C>[];
}

/**
 * The member of `values` equal to `raw`, or `undefined`. Searching the list instead of casting
 * keeps the result typed.
 */
export function findConstant<Value extends string>(
  values: readonly Value[],
  raw: string,
): Value | undefined {
  return values.find((value) => value === raw);
}
