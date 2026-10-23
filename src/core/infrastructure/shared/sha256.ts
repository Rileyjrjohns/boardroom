// SHA-256 of a short text, in plain TypeScript. It names files: the name of a downloaded document
// is the digest of who it was downloaded for, which document, and which version, so that two
// different triples can never share a file, whatever characters their parts contain, and the name
// is short, safe in every file system and carries nothing of the identifiers.
//
// It is for short texts (identifiers). On a Hermes device a JavaScript hash runs at a few
// megabytes per second, so it is not what to hash the content of a document with.

const BYTE_MASK = 0xff;
const WORD_BITS = 32;
const BLOCK_BYTES = 64;
const LENGTH_BYTES = 8;
const ROUNDS = 64;
/** What a lone surrogate, which has no UTF-8 form, is written as. */
const REPLACEMENT_CHARACTER = 0xfffd;

// The first 32 bits of the fractional parts of the cube roots of the first 64 primes.
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// The first 32 bits of the fractional parts of the square roots of the first 8 primes.
const INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const rotateRight = (word: number, bits: number): number =>
  (word >>> bits) | (word << (WORD_BITS - bits));

/** The UTF-8 bytes of a text. A lone surrogate becomes the replacement character. */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text) {
    let point = character.codePointAt(0) ?? REPLACEMENT_CHARACTER;
    if (point >= 0xd800 && point <= 0xdfff) point = REPLACEMENT_CHARACTER;
    if (point < 0x80) {
      bytes.push(point);
    } else if (point < 0x800) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return bytes;
}

/** The message padded to a whole number of blocks, with its length in bits at the end. */
function padded(message: readonly number[]): Uint8Array {
  const withMarker = message.length + 1 + LENGTH_BYTES;
  const blocks = Math.ceil(withMarker / BLOCK_BYTES);
  const bytes = new Uint8Array(blocks * BLOCK_BYTES);
  bytes.set(message);
  bytes[message.length] = 0x80;
  const bits = message.length * 8;
  const high = Math.floor(bits / 2 ** WORD_BITS);
  const low = bits >>> 0;
  const end = bytes.length;
  for (let index = 0; index < 4; index += 1) {
    bytes[end - 8 + index] = (high >>> (24 - 8 * index)) & BYTE_MASK;
    bytes[end - 4 + index] = (low >>> (24 - 8 * index)) & BYTE_MASK;
  }
  return bytes;
}

/** The SHA-256 digest of the UTF-8 form of `text`, as 64 lower case hexadecimal digits. */
export function sha256Hex(text: string): string {
  const bytes = padded(utf8Bytes(text));
  const state = Uint32Array.from(INITIAL_STATE);
  const schedule = new Uint32Array(ROUNDS);

  for (let offset = 0; offset < bytes.length; offset += BLOCK_BYTES) {
    for (let index = 0; index < 16; index += 1) {
      const at = offset + index * 4;
      schedule[index] =
        ((bytes[at] ?? 0) << 24) |
        ((bytes[at + 1] ?? 0) << 16) |
        ((bytes[at + 2] ?? 0) << 8) |
        (bytes[at + 3] ?? 0);
    }
    for (let index = 16; index < ROUNDS; index += 1) {
      const w15 = schedule[index - 15] ?? 0;
      const w2 = schedule[index - 2] ?? 0;
      const small0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const small1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      schedule[index] =
        ((schedule[index - 16] ?? 0) + small0 + (schedule[index - 7] ?? 0) + small1) >>> 0;
    }

    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;
    for (let index = 0; index < ROUNDS; index += 1) {
      const big1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first =
        (h + big1 + choice + (ROUND_CONSTANTS[index] ?? 0) + (schedule[index] ?? 0)) >>> 0;
      const big0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (big0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    const round = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1) {
      state[index] = ((state[index] ?? 0) + (round[index] ?? 0)) >>> 0;
    }
  }

  return Array.from(state, (word) => word.toString(16).padStart(8, '0')).join('');
}
