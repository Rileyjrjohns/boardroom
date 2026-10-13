import type { AuthSession } from '@application/ports/AuthSession';
import type { BiometricGate } from '@application/ports/BiometricGate';
import type { Clock } from '@application/ports/Clock';
import type { DocumentCache } from '@application/ports/DocumentCache';
import type { DocumentRepository } from '@application/ports/DocumentRepository';
import type { MeetingCache } from '@application/ports/MeetingCache';
import type { MeetingRepository } from '@application/ports/MeetingRepository';
import type { Monitoring } from '@application/ports/Monitoring';
import type { ScreenProtection } from '@application/ports/ScreenProtection';
import type { VoteOutbox } from '@application/ports/VoteOutbox';
import type { VoteRepository } from '@application/ports/VoteRepository';
import type { Duration } from '@domain/value-objects/Duration';

/**
 * An adapter for every port the use cases need. A configuration builds one of these; the use cases
 * are wired from it, the same way whatever the adapters are.
 */
export interface Ports {
  readonly clock: Clock;
  readonly monitoring: Monitoring;
  readonly auth: AuthSession;
  readonly biometricGate: BiometricGate;
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
}
