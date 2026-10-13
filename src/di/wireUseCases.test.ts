import { SYNC_OUTCOME } from '@application/use-cases/votes/SyncPendingVotes';
import { createFakes } from '@application/testing/createFakes';
import { OUTBOX_STATUS } from '@domain/entities/OutboxVote';
import { unexpected } from '@domain/errors/RepositoryError';
import { VOTE_DELIVERY_ERROR_CODE } from '@domain/errors/VoteDeliveryError';
import { err, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_MINUTE,
  NOW,
  aConfidentialDocument,
  aDocumentId,
  aDocumentLocation,
  aDuration,
  aMeeting,
  aMeetingId,
  aPendingVote,
  aVote,
  at,
  unwrap,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { createPageRequest } from '@domain/value-objects/PageRequest';

import type { Ports, UseCaseSettings } from './Ports';
import { wireUseCases } from './wireUseCases';

const SETTINGS: UseCaseSettings = {
  maxCacheAge: aDuration(10 * MILLIS_PER_MINUTE),
  maxAttempts: 2,
  gracePeriod: aDuration(MILLIS_PER_MINUTE),
};

/** The fakes, as the ports a configuration would build. */
function wired() {
  const fakes = createFakes();
  const ports: Ports = fakes;
  return { fakes, useCases: wireUseCases(ports, SETTINGS) };
}

const firstPage = unwrap(createPageRequest({ limit: 5 }));

describe('wireUseCases', () => {
  it('builds every use case, each one working on the ports it was given', async () => {
    const { fakes, useCases } = wired();
    fakes.meetings.addMeeting(aMeeting());

    expect((await useCases.getMeeting.execute({ meetingId: aMeetingId() })).ok).toBe(true);
    expect(
      (await useCases.listMeetings.execute({ period: MEETING_PERIOD.Upcoming, request: firstPage }))
        .ok,
    ).toBe(true);
    expect((await useCases.unlockApp.execute()).ok).toBe(true);
    expect((await useCases.listPendingVotes.execute()).ok).toBe(true);
    expect((await useCases.syncPendingVotes.execute()).ok).toBe(true);
    expect((await useCases.restoreSession.execute()).ok).toBe(true);
    expect((await useCases.evaluateAppLock.execute({ backgroundedAt: NOW })).ok).toBe(true);
    expect((await useCases.signOut.execute()).ok).toBe(true);
    expect(fakes.auth.signOutCalls).toBe(1);
  });

  it('hands out the same instance every time it is read, so that guards in memory hold', async () => {
    const { fakes, useCases } = wired();
    fakes.meetings.addMeeting(aMeeting());

    const first = useCases.castVote.execute({
      meetingId: aMeetingId(),
      resolutionId: aVote().resolutionId,
      choice: aVote().choice,
    });
    const second = useCases.castVote.execute({
      meetingId: aMeetingId(),
      resolutionId: aVote().resolutionId,
      choice: aVote().choice,
    });

    expect(await second).toEqual(err({ code: VOTE_DELIVERY_ERROR_CODE.InProgress }));
    expect((await first).ok).toBe(true);
  });

  it('shares one SyncPendingVotes: a second call during a run does nothing', async () => {
    const { fakes, useCases } = wired();
    await fakes.outbox.enqueue(aPendingVote());

    const first = useCases.syncPendingVotes.execute();
    const second = useCases.syncPendingVotes.execute();

    expect(await second).toEqual(ok({ outcome: SYNC_OUTCOME.AlreadyRunning }));
    expect((await first).ok).toBe(true);
    expect(fakes.votes.received).toHaveLength(1);
  });

  it('shares one ScreenProtectionCoordinator between opening and closing documents', async () => {
    const { fakes, useCases } = wired();
    const first = aConfidentialDocument({ id: aDocumentId('document-1') });
    const second = aConfidentialDocument({ id: aDocumentId('document-2') });
    fakes.documents.addDocument(first, aDocumentLocation('file:///documents/1.pdf'));
    fakes.documents.addDocument(second, aDocumentLocation('file:///documents/2.pdf'));
    await useCases.openDocument.execute({ documentId: first.id });
    await useCases.openDocument.execute({ documentId: second.id });
    expect(fakes.screenProtection.enabled).toBe(true);

    await useCases.closeDocument.execute({ documentId: first.id });
    expect(fakes.screenProtection.enabled).toBe(true);

    await useCases.closeDocument.execute({ documentId: second.id });
    expect(fakes.screenProtection.enabled).toBe(false);
  });

  it('forwards the maximum age of the cache: older than it, an entry is not served offline', async () => {
    const { fakes, useCases } = wired();
    fakes.meetings.addMeeting(aMeeting());
    await useCases.getMeeting.execute({ meetingId: aMeetingId() });
    fakes.network.goOffline();

    fakes.clock.advance(10 * MILLIS_PER_MINUTE);
    const withinAge = await useCases.getMeeting.execute({ meetingId: aMeetingId() });
    fakes.clock.advance(1);
    const tooOld = await useCases.getMeeting.execute({ meetingId: aMeetingId() });

    expect(withinAge.ok && withinAge.value.source).toEqual({
      freshness: 'stale',
      cachedAt: NOW,
    });
    expect(tooOld.ok).toBe(false);
  });

  it('forwards the maximum number of attempts: a vote is given up after that many unexpected failures', async () => {
    const { fakes, useCases } = wired();
    await fakes.outbox.enqueue(aPendingVote(aVote(), at(0)));
    fakes.votes.answerNext(err(unexpected()));
    fakes.votes.answerNext(err(unexpected()));

    await useCases.syncPendingVotes.execute();
    expect(fakes.outbox.snapshot()[0]?.status).toBe(OUTBOX_STATUS.Pending);
    await useCases.syncPendingVotes.execute();

    expect(fakes.outbox.snapshot()[0]).toMatchObject({
      status: OUTBOX_STATUS.Rejected,
      reason: { code: VOTE_DELIVERY_ERROR_CODE.Undeliverable, attempts: 2 },
    });
  });

  it('forwards the grace period of the app lock', async () => {
    const { fakes, useCases } = wired();
    fakes.clock.advance(MILLIS_PER_MINUTE - 1);
    const before = await useCases.evaluateAppLock.execute({ backgroundedAt: NOW });
    fakes.clock.advance(1);
    const after = await useCases.evaluateAppLock.execute({ backgroundedAt: NOW });

    expect(before).toEqual(ok(false));
    expect(after).toEqual(ok(true));
  });

  it('builds a new set every time: nothing is shared between two calls', async () => {
    const { fakes } = wired();
    const first = wireUseCases(fakes, SETTINGS);
    const second = wireUseCases(fakes, SETTINGS);

    expect(first.castVote).not.toBe(second.castVote);
    expect(first.syncPendingVotes).not.toBe(second.syncPendingVotes);
    expect(first.listMeetings).not.toBe(second.listMeetings);
  });
});
