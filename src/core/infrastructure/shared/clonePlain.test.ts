import { clonePlain } from './clonePlain';

interface Nested {
  readonly name: string;
  readonly tags: readonly string[];
  readonly child?: { readonly count: number };
}

describe('clonePlain', () => {
  it('copies objects and arrays, at any depth, into equal but separate values', () => {
    const original: Nested = { name: 'a', tags: ['x', 'y'], child: { count: 1 } };

    const copy = clonePlain(original);

    expect(copy).toStrictEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.tags).not.toBe(original.tags);
    expect(copy.child).not.toBe(original.child);
  });

  it('is not affected by a later change of the original, and does not affect it', () => {
    const original: Nested = { name: 'a', tags: ['x'], child: { count: 1 } };
    const copy = clonePlain(original);

    (original as { name: string }).name = 'changed';
    (original.tags as string[]).push('added');
    (copy.child as { count: number }).count = 99;

    expect(copy.name).toBe('a');
    expect(copy.tags).toEqual(['x']);
    expect(original.child?.count).toBe(1);
  });

  it('keeps primitives, null and an absent property as they are', () => {
    expect(clonePlain(7)).toBe(7);
    expect(clonePlain('text')).toBe('text');
    expect(clonePlain(null)).toBeNull();
    expect(clonePlain(undefined)).toBeUndefined();
    expect(clonePlain({ name: 'a', tags: [] })).toStrictEqual({ name: 'a', tags: [] });
  });
});
