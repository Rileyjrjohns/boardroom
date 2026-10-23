import { sha256Hex } from './sha256';

// The digest is checked against the one of Node, which is the reference, on texts that sit on both
// sides of the boundaries of the algorithm (the padding changes at 55, 56, 63 and 64 bytes) and on
// texts that are not ASCII.

interface NodeCrypto {
  createHash(algorithm: string): { update(text: string): { digest(encoding: 'hex'): string } };
}

const nodeCrypto = process.getBuiltinModule('node:crypto') as unknown as NodeCrypto;
const referenceOf = (text: string): string =>
  nodeCrypto.createHash('sha256').update(text).digest('hex');

describe('sha256Hex', () => {
  it.each([
    ['nothing', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ])('gives the published digest of %s', (_name, text, digest) => {
    expect(sha256Hex(text)).toBe(digest);
  });

  it.each([54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000])(
    'gives the digest Node gives for %i characters',
    (length) => {
      const text = 'a'.repeat(length);

      expect(sha256Hex(text)).toBe(referenceOf(text));
    },
  );

  it.each([
    ['accents', 'Rémunération du comité'],
    ['an emoji, which is a surrogate pair', 'Board \u{1F3DB} pack'],
    ['characters of three bytes', '€ ’ 中文'],
    ['separators and quotes', '["a|b","c/d",\'e\\\\f\']'],
  ])('gives the digest Node gives for %s', (_name, text) => {
    expect(sha256Hex(text)).toBe(referenceOf(text));
  });

  it('reads a lone surrogate as the replacement character, as the encoder of Node does', () => {
    expect(sha256Hex('a\ud800b')).toBe(referenceOf('a\ud800b'));
    expect(sha256Hex('a\ud800b')).toBe(sha256Hex('a�b'));
  });

  it('gives 64 lower case hexadecimal digits, and another digest for another text', () => {
    expect(sha256Hex('one')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('one')).not.toBe(sha256Hex('One'));
  });
});
