import { isAtOrAfter } from '@core/domain/value-objects/Instant';
import type { Instant } from '@core/domain/value-objects/Instant';

import type { Session } from '../entities/Session';

/** A session is expired at its expiry instant and after it. */
export function isSessionExpired(session: Session, now: Instant): boolean {
  return isAtOrAfter(now, session.expiresAt);
}
