import type { RandomBytes } from '../persistence/randomKey';

// Test support, not production code: the random source of Node (`node:crypto`), which stands in for
// `expo-crypto` in the tests, as `node:sqlite` stands in for `expo-sqlite`. The module is obtained
// from the process, like the other Node modules of the tests (see `NodeSqlite.ts`).

interface NodeCrypto {
  randomBytes(size: number): Uint8Array;
}

function loadNodeCrypto(): NodeCrypto {
  return process.getBuiltinModule('node:crypto') as unknown as NodeCrypto;
}

export const nodeRandomBytes: RandomBytes = (byteCount) =>
  Promise.resolve(loadNodeCrypto().randomBytes(byteCount));
