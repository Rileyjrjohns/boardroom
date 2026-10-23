import type { Clock } from '@core/application/ports/Clock';
import type { Connectivity } from '@core/application/ports/Connectivity';
import type { Monitoring } from '@core/application/ports/Monitoring';
import type { Duration } from '@core/domain/value-objects/Duration';
import type { AuthSession } from '@features/auth/application/ports/AuthSession';
import type { BiometricGate } from '@features/auth/application/ports/BiometricGate';
import type { DocumentCache } from '@features/documents/application/ports/DocumentCache';
import type { DocumentRepository } from '@features/documents/application/ports/DocumentRepository';
import type { ScreenProtection } from '@features/documents/application/ports/ScreenProtection';
import type { MeetingCache } from '@features/meetings/application/ports/MeetingCache';
import type { MeetingRepository } from '@features/meetings/application/ports/MeetingRepository';
import type { VoteOutbox } from '@features/votes/application/ports/VoteOutbox';
import type { VoteRepository } from '@features/votes/application/ports/VoteRepository';

/**
 * An adapter for every port the use cases need. A configuration builds one of these; the use cases
 * are wired from it, the same way whatever the adapters are.
 */
export interface Ports {
  readonly clock: Clock;
  readonly monitoring: Monitoring;
  readonly auth: AuthSession;
  readonly biometricGate: BiometricGate;
  readonly connectivity: Connectivity;
  readonly screenProtection: ScreenProtection;
  readonly meetings: MeetingRepository;
  readonly meetingCache: MeetingCache;
  readonly documents: DocumentRepository;
  readonly documentCache: DocumentCache;
  readonly votes: VoteRepository;
  readonly outbox: VoteOutbox;
}

/** The configuration values the use cases take in their `deps` (see `config.ts`). */
export interface UseCaseSettings {
  readonly maxCacheAge: Duration;
  readonly maxAttempts: number;
  readonly gracePeriod: Duration;
  /**
   * Whether the app is locked when it is built. A real cold start is (the session that is
   * restored must be unlocked with the biometrics); a configuration that opens a session by
   * itself, as if the user had just signed in, is not.
   */
  readonly startsLocked: boolean;
}
