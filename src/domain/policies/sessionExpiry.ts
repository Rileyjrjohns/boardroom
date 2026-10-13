import type { Session } from '../entities/Session';
import { isAtOrAfter } from '../value-objects/Instant';
import type { Instant } from '../value-objects/Instant';

/** A session is expired at its expiry instant and after it. */
export function isSessionExpired(session: Session, now: Instant): boolean {
  return isAtOrAfter(now, session.expiresAt);
}
