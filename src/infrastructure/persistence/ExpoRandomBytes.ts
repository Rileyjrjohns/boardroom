import { getRandomBytesAsync } from 'expo-crypto';

import type { RandomBytes } from './randomKey';

// The device side of the key of the database: the secure random generator of the platform, through
// `expo-crypto`. It is a line: it decides nothing and checks nothing, because what the bytes make
// (the key, and what is wrong with them) is in `keyFromBytes` and `openProtectedDatabase`, which
// are tested. A test of this file would only prove that a mock was called.

/** `expo-crypto` rejects when the platform's generator fails, it never answers with weaker bytes. */
export const expoRandomBytes: RandomBytes = (byteCount) => getRandomBytesAsync(byteCount);
