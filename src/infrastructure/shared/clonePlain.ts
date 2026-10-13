/**
 * A deep copy of plain data: objects, arrays and primitives, which is all an entity is. The
 * in-memory stores copy what they are given and what they hand back, so that nobody holds a
 * reference into the store: mutating an object after saving it, or after reading it, changes
 * nothing the store holds. A real adapter gets the same guarantee from its serialisation (rows,
 * JSON) and the contract tests check it on both.
 *
 * The brand of a branded value is a type, not data, so the copy keeps it.
 */
export function clonePlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => clonePlain(item)) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clonePlain(child)]),
    ) as T;
  }
  return value;
}
