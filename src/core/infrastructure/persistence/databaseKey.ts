/** The key of the database: 256 bits as 64 lower case hexadecimal digits. */
export const KEY_FORMAT = /^[0-9a-f]{64}$/;

/** The key and which file it opens (see `databaseFileName`). Kept in the keychain as one item. */
export interface KeyState {
  readonly generation: number;
  readonly key: string;
}

/** The generation of the file the app starts with. */
export const FIRST_GENERATION = 0;

const GENERATION_SEPARATOR = ':';
/** `<generation>:<key>`, or a bare key, which is what an app that knew only one file kept. */
const STATE_FORMAT = /^(?:([0-9]{1,6}):)?([0-9a-f]{64})$/;
const RADIX = 10;

/** What is kept in the keychain for a state. */
export function formatKeyState(state: KeyState): string {
  return `${state.generation}${GENERATION_SEPARATOR}${state.key}`;
}

/**
 * The state an item holds, or `undefined` for an item that is not one. The caller tells the two
 * apart: an item that is not there is a key that was lost, an item that is there and does not read
 * is a keychain that cannot be trusted.
 */
export function parseKeyState(item: string): KeyState | undefined {
  const parts = STATE_FORMAT.exec(item);
  const key = parts?.[2];
  if (key === undefined) return undefined;
  const generation = parts?.[1];
  return {
    generation: generation === undefined ? FIRST_GENERATION : Number.parseInt(generation, RADIX),
    key,
  };
}

/**
 * The name of the file of a generation of the database. The first one is called `name`, so that an
 * app that knew only one file finds it. A file that cannot be read is never deleted to make room
 * for a new database: the next generation is another file, and the one that could not be read stays
 * where it is (see `openProtectedDatabase`).
 */
export function databaseFileName(name: string, generation: number): string {
  return generation === FIRST_GENERATION ? name : `${name}.${generation}`;
}
