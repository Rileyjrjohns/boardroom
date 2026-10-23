import type { Instant } from '@core/domain/value-objects/Instant';
import type { EmailAddress } from '@features/auth/domain/value-objects/EmailAddress';

/**
 * What every document shows on every page to identify who is reading it.
 *
 * The domain guarantees the content: the full name and the email of the signed-in user, taken from
 * validated data (never blank, a well-formed email), and the instant at which the document was
 * opened. It deliberately leaves everything visual to the presentation: how the instant is
 * formatted (language, time zone, date style), and the layout (text, tiling, angle, opacity).
 */
export interface Watermark {
  readonly fullName: string;
  readonly email: EmailAddress;
  readonly viewedAt: Instant;
}

/** Builds the watermark of a reader. Any `User` fits the first parameter. */
export function createWatermark(
  reader: { readonly fullName: string; readonly email: EmailAddress },
  viewedAt: Instant,
): Watermark {
  return { fullName: reader.fullName, email: reader.email, viewedAt };
}
