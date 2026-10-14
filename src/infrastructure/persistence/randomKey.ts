import { KEY_FORMAT } from './databaseKey';

/**
 * A source of secure random bytes: the number of bytes asked for, as an array of that length. The
 * device's one is `expo-crypto` (`ExpoRandomBytes`), which draws from the secure generator of the
 * platform (`SecRandomCopyBytes` on iOS, `SecureRandom` on Android) and rejects instead of falling
 * back on a weaker source. It is a parameter and not an import so that the tests run in Node with
 * the random source of Node (`nodeRandomBytes`), and so that this file knows no native module.
 */
export type RandomBytes = (byteCount: number) => Promise<Uint8Array>;

/** The length of the key of the database: 256 bits. */
export const KEY_BYTES = 32;

const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

/**
 * The key a source's bytes make: 64 lower-case hexadecimal digits (`KEY_FORMAT`), which is the form
 * a key has always been kept in, so that a database made by an earlier version still opens.
 * `undefined` when the bytes cannot make a key: not an array of bytes, not exactly `KEY_BYTES` of
 * them, or all zero (a generator that fails by answering zeros is broken, and a key of zeros would
 * look valid).
 *
 * The check does not use `instanceof Uint8Array`: the array can come from another realm (the
 * sandbox of a test, a native bridge) and then be an array of bytes that is not an instance of this
 * realm's class.
 */
export function keyFromBytes(bytes: unknown): string | undefined {
  if (!ArrayBuffer.isView(bytes) || bytes.byteLength !== KEY_BYTES) return undefined;
  const octets = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (octets.every((octet) => octet === 0)) return undefined;

  const key = Array.from(octets, (octet) =>
    octet.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
  ).join('');
  return KEY_FORMAT.test(key) ? key : undefined;
}
