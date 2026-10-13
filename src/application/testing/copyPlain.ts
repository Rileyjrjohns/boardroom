/**
 * A deep copy of plain data: objects, arrays and primitives, which is all an entity is. The fakes
 * of the caches and of the outbox copy what they are given and what they hand back, as the real
 * adapters do by turning the data into rows and back, so that a test cannot pass by accident
 * because a use case mutated an object the fake also holds.
 */
export function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => copyPlain(item)) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, copyPlain(child)]),
    ) as T;
  }
  return value;
}
