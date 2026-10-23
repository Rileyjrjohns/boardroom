/** The first bytes of every PDF file: `%PDF-`, then the version. */
const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

/**
 * Whether the bytes start with the signature of a PDF file. It is the cheap check of a download:
 * a server that answers `application/pdf` and sends something else (an error page, a redirect to
 * a sign-in form, a file of another kind) is caught before anything is stored. It says nothing of
 * whether the file is valid, which only a PDF reader can tell.
 */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= SIGNATURE.length && SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
}
