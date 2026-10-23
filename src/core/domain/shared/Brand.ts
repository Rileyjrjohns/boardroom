declare const brandName: unique symbol;

/**
 * Nominal typing for a primitive: a `UserId` and a `MeetingId` are both strings at runtime, but the
 * compiler refuses to use one for the other. The brand exists in the type system only. A branded
 * value is the plain primitive, so it serialises to JSON and SQLite as is.
 *
 * A branded value is made in the validating factory of its value object, and only there: that is
 * the single place that vouches for the raw value.
 */
export type Brand<Base, Name extends string> = Base & { readonly [brandName]: Name };
