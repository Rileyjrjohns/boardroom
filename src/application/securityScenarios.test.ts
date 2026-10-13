import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { OUTBOX_STATUS } from '@domain/entities/OutboxVote';
import {
  appLocked,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from '@domain/errors/AuthenticationError';
import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
} from '@domain/errors/RepositoryError';
import { storageWriteFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_HOUR,
  NOW,
  aConfidentialDocument,
  aDocument,
  aDocumentId,
  aDocumentLocation,
  aDuration,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aPendingVote,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
  anEmail,
  at,
  unwrap,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { createPage } from '@domain/value-objects/Page';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { LOG_ATTRIBUTE, MONITORING_EVENT } from './ports/Monitoring';
import { SCREEN_CAPTURE_KIND } from './ports/ScreenProtection';
import { createFakes } from './testing/createFakes';
import { EvaluateAppLock } from './use-cases/auth/EvaluateAppLock';
import { RestoreSession } from './use-cases/auth/RestoreSession';
import { SignIn } from './use-cases/auth/SignIn';
import { SignOut } from './use-cases/auth/SignOut';
import { UnlockApp } from './use-cases/auth/UnlockApp';
import { CloseDocument } from './use-cases/documents/CloseDocument';
import { ObserveScreenCapture } from './use-cases/documents/ObserveScreenCapture';
import { OpenDocument } from './use-cases/documents/OpenDocument';
import { GetMeeting } from './use-cases/meetings/GetMeeting';
import { ListMeetings } from './use-cases/meetings/ListMeetings';
import { CastVote } from './use-cases/votes/CastVote';
import { ListPendingVotes } from './use-cases/votes/ListPendingVotes';
import { SyncPendingVotes } from './use-cases/votes/SyncPendingVotes';

// The security weaknesses found by the independent re-check of the domain and the application,
// each reproduced as a scenario through the use cases, with the fakes of the ports. A scenario
// failed before its fix; together they are the regression suite of the fixes.

const ALICE = aUser();
const BRUNO = aUser({
  id: aUserId('user-2'),
  fullName: 'Bruno Durand',
  email: anEmail('bruno@example.com'),
});
const BRUNO_PASSWORD = 'bruno-secret';

type Fakes = ReturnType<typeof createFakes>;

/** The fakes, with a second account that can sign in. */
function world(): Fakes {
  const fakes = createFakes();
  fakes.auth.registerAccount(BRUNO.email, BRUNO_PASSWORD, aSession({ user: BRUNO }));
  return fakes;
}

const signInAsBruno = (fakes: Fakes) =>
  new SignIn(fakes).execute({ email: BRUNO.email, password: BRUNO_PASSWORD });

const MEETING = aMeeting();
const OTHER_MEETING_ID = aMeetingId('meeting-2');
const FIRST_PAGE = unwrap(createPageRequest({ limit: 20 }));
const PAGE_KEY = { period: MEETING_PERIOD.Upcoming, limit: 20 } as const;
const VIEWABLE = { document: aDocument(), location: aDocumentLocation() };

/** Lets the work that a callback started in the background finish. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('F1: the app lock is enforced, not only returned', () => {
  it('locks every read after a cold start, and RestoreSession gives away no identity', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);

    const restored = await new RestoreSession(fakes).execute();

    expect(restored).toEqual(ok({ status: 'unlockRequired' }));
    expect(JSON.stringify(restored)).not.toContain(ALICE.fullName);
    expect(JSON.stringify(restored)).not.toContain(ALICE.email);
    expect(await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).toEqual(
      err(appLocked()),
    );
    expect(
      await new ListMeetings({ ...fakes }).execute({
        period: MEETING_PERIOD.Upcoming,
        request: FIRST_PAGE,
      }),
    ).toEqual(err(appLocked()));
    expect(fakes.meetings.getCalls).toEqual([]);
  });

  it('locks everything else too: documents, votes, the outbox and its synchronisation', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    fakes.documents.addDocument(aDocument(), aDocumentLocation());
    fakes.outbox.seed(aPendingVote());
    await new RestoreSession(fakes).execute();

    const results = [
      await new OpenDocument(fakes).execute({ documentId: aDocument().id }),
      await new CastVote(fakes).execute({
        meetingId: MEETING.id,
        resolutionId: aResolutionId(),
        choice: VOTE_CHOICE.For,
      }),
      await new ListPendingVotes(fakes).execute(),
      await new SyncPendingVotes({ ...fakes }).execute(),
    ];

    expect(results).toEqual(results.map(() => err(appLocked())));
    expect(fakes.votes.received).toEqual([]);
    expect(fakes.screenProtection.enableCalls).toBe(0);
    expect(fakes.outbox.snapshot()).toEqual([aPendingVote()]);
  });

  it('opens again when the biometrics succeed, and stays closed when they do not', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    await new RestoreSession(fakes).execute();
    fakes.biometricGate.authentication = err({ code: 'biometricFailed' });

    await new UnlockApp(fakes).execute();
    expect(await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).toEqual(
      err(appLocked()),
    );

    fakes.biometricGate.authentication = ok(undefined);
    await new UnlockApp(fakes).execute();
    expect((await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).ok).toBe(true);
  });

  it('locks when the grace period in the background is over, and not before', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    const evaluate = new EvaluateAppLock({ ...fakes, gracePeriod: aDuration(60_000) });

    fakes.clock.advance(59_999);
    expect(await evaluate.execute({ backgroundedAt: NOW })).toEqual(ok(false));
    expect((await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).ok).toBe(true);

    fakes.clock.advance(1);
    expect(await evaluate.execute({ backgroundedAt: NOW })).toEqual(ok(true));
    expect(await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).toEqual(
      err(appLocked()),
    );
  });

  it('leaves the app unlocked after a sign-in, and locked after a sign-out', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    await new RestoreSession(fakes).execute();

    await signInAsBruno(fakes);
    expect((await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).ok).toBe(true);

    await new SignOut(fakes).execute();
    fakes.auth.session = aSession();
    expect(await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).toEqual(
      err(appLocked()),
    );
  });

  it('answers that nobody is signed in before it answers that the app is locked', async () => {
    const fakes = world();
    await new RestoreSession(fakes).execute();
    fakes.auth.session = undefined;

    expect(await new GetMeeting(fakes).execute({ meetingId: MEETING.id })).toEqual(
      err(notAuthenticated()),
    );
  });
});

describe('F2: a document served from the cache is always opened with the screen protected', () => {
  it('protects a document cached as public and reclassified confidential since', async () => {
    const fakes = world();
    const cached = aDocument({ confidentiality: CONFIDENTIALITY_LEVEL.Public });
    await fakes.documentCache.save(
      ALICE.id,
      { document: cached, location: VIEWABLE.location },
      NOW,
    );
    fakes.network.goOffline();

    const opened = await new OpenDocument(fakes).execute({ documentId: cached.id });

    expect(opened.ok && opened.value.screenProtected).toBe(true);
    expect(fakes.screenProtection.enabled).toBe(true);
  });

  it('protects any stale document, whatever its cached level', async () => {
    for (const level of Object.values(CONFIDENTIALITY_LEVEL)) {
      const fakes = world();
      const cached = aDocument({ confidentiality: level });
      await fakes.documentCache.save(
        ALICE.id,
        { document: cached, location: VIEWABLE.location },
        NOW,
      );
      fakes.network.goOffline();

      const opened = await new OpenDocument(fakes).execute({ documentId: cached.id });

      expect(opened.ok && opened.value.screenProtected).toBe(true);
    }
  });

  it('does not serve an old entry that a failed write-through left behind', async () => {
    const fakes = world();
    const old = aDocument({ confidentiality: CONFIDENTIALITY_LEVEL.Public });
    await fakes.documentCache.save(ALICE.id, { document: old, location: VIEWABLE.location }, NOW);
    fakes.documents.addDocument(aConfidentialDocument({ id: old.id }), VIEWABLE.location);
    fakes.documentCache.writeFailure = storageWriteFailed();
    const online = await new OpenDocument(fakes).execute({ documentId: old.id });
    fakes.documentCache.writeFailure = undefined;
    fakes.network.goOffline();

    const offline = await new OpenDocument(fakes).execute({ documentId: old.id });

    expect(online.ok && online.value.screenProtected).toBe(true);
    expect(offline).toEqual(err(networkUnavailable()));
  });

  it('leaves a fresh public document unprotected: only what came from the cache is suspect', async () => {
    const fakes = world();
    fakes.documents.addDocument(aDocument(), VIEWABLE.location);

    const opened = await new OpenDocument(fakes).execute({ documentId: aDocument().id });

    expect(opened.ok && opened.value.screenProtected).toBe(false);
    expect(fakes.screenProtection.enableCalls).toBe(0);
  });
});

describe('F3: a revocation empties what hangs off the item, and a failed eviction empties everything', () => {
  async function fillCaches(fakes: Fakes) {
    const other = aMeeting({ summary: aMeetingSummary({ id: OTHER_MEETING_ID }) });
    const otherDocument = aDocument({ id: aDocumentId('document-9') });
    await fakes.meetingCache.saveMeeting(ALICE.id, MEETING, NOW);
    await fakes.meetingCache.saveMeeting(ALICE.id, other, NOW);
    await fakes.meetingCache.savePage(ALICE.id, PAGE_KEY, createPage([aMeetingSummary()]), NOW);
    await fakes.documentCache.save(
      ALICE.id,
      { document: aDocument(), location: VIEWABLE.location },
      NOW,
    );
    await fakes.documentCache.save(
      ALICE.id,
      { document: otherDocument, location: aDocumentLocation('file:///documents/9.pdf') },
      NOW,
    );
    return { other, otherDocument };
  }

  it('empties both caches, for everyone, when the session is refused', async () => {
    const fakes = world();
    await fillCaches(fakes);
    await fakes.meetingCache.saveMeeting(BRUNO.id, MEETING, NOW);
    fakes.meetings.failure = unauthorized();

    const result = await new GetMeeting(fakes).execute({ meetingId: MEETING.id });

    expect(result).toEqual(err(unauthorized()));
    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
  });

  it('empties both caches too when the session is refused on a document or on a list', async () => {
    const onDocument = world();
    await fillCaches(onDocument);
    onDocument.documents.failure = unauthorized();
    await new OpenDocument(onDocument).execute({ documentId: aDocument().id });
    const onList = world();
    await fillCaches(onList);
    onList.meetings.failure = unauthorized();
    await new ListMeetings({ ...onList }).execute({
      period: MEETING_PERIOD.Upcoming,
      request: FIRST_PAGE,
    });

    for (const fakes of [onDocument, onList]) {
      expect(fakes.meetingCache.isEmpty()).toBe(true);
      expect(fakes.documentCache.isEmpty()).toBe(true);
    }
  });

  it.each([
    ['forbidden', forbidden(), (fakes: Fakes) => fakes.meetings.forbid(MEETING.id)],
    ['gone', notFound(), (fakes: Fakes) => fakes.meetings.removeMeeting(MEETING.id)],
  ] as const)(
    'removes a meeting that is %s and every document it lists, and nothing else',
    async (_name, refusal, refuse) => {
      const fakes = world();
      const { other, otherDocument } = await fillCaches(fakes);
      refuse(fakes);

      const result = await new GetMeeting(fakes).execute({ meetingId: MEETING.id });

      expect(result).toEqual(err(refusal));
      expect(await fakes.meetingCache.readMeeting(ALICE.id, MEETING.id)).toEqual(ok(undefined));
      expect(await fakes.documentCache.read(ALICE.id, aDocument().id)).toEqual(ok(undefined));
      expect((await fakes.meetingCache.readMeeting(ALICE.id, other.id)).ok).toBe(true);
      const kept = await fakes.documentCache.read(ALICE.id, otherDocument.id);
      expect(kept.ok && kept.value !== undefined).toBe(true);
    },
  );

  it('removes a document that is forbidden, and only that document', async () => {
    const fakes = world();
    const { otherDocument } = await fillCaches(fakes);
    fakes.documents.addDocument(aDocument(), VIEWABLE.location);
    fakes.documents.forbid(aDocument().id);

    const result = await new OpenDocument(fakes).execute({ documentId: aDocument().id });

    expect(result).toEqual(err(forbidden()));
    expect(await fakes.documentCache.read(ALICE.id, aDocument().id)).toEqual(ok(undefined));
    const kept = await fakes.documentCache.read(ALICE.id, otherDocument.id);
    expect(kept.ok && kept.value !== undefined).toBe(true);
    expect((await fakes.meetingCache.readMeeting(ALICE.id, MEETING.id)).ok).toBe(true);
  });

  it('empties everything when a copy cannot be removed, so that it cannot be served afterwards', async () => {
    const fakes = world();
    await fillCaches(fakes);
    fakes.meetings.addMeeting(MEETING);
    fakes.meetings.forbid(MEETING.id);
    fakes.meetingCache.removeFailure = storageWriteFailed();

    await new GetMeeting(fakes).execute({ meetingId: MEETING.id });

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
  });

  it('captures the failure when even the purge fails', async () => {
    const fakes = world();
    await fillCaches(fakes);
    fakes.meetings.forbid(MEETING.id);
    fakes.meetingCache.removeFailure = storageWriteFailed();
    fakes.meetingCache.purgeFailure = storageWriteFailed();

    const result = await new GetMeeting(fakes).execute({ meetingId: MEETING.id });

    expect(result).toEqual(err(forbidden()));
    expect(fakes.monitoring.capturedEvents()).toContain(MONITORING_EVENT.CachePurgeFailed);
  });
});

describe('F4: the screen stays protected while a confidential document is displayed', () => {
  const confidential = aConfidentialDocument();

  it('counts the views of a document: closing one of two leaves the protection on', async () => {
    const fakes = world();
    fakes.documents.addDocument(confidential, VIEWABLE.location);
    const open = new OpenDocument(fakes);
    await open.execute({ documentId: confidential.id });
    await open.execute({ documentId: confidential.id });

    await new CloseDocument(fakes).execute({ documentId: confidential.id });
    expect(fakes.screenProtection.enabled).toBe(true);

    await new CloseDocument(fakes).execute({ documentId: confidential.id });
    expect(fakes.screenProtection.enabled).toBe(false);
  });
});

describe('F5: the user is checked again after the remote call', () => {
  const SLOW = (fakes: Fakes) => async () => {
    await new SignOut(fakes).execute();
    await signInAsBruno(fakes);
  };

  it('writes nothing under the previous owner when a request spans a sign-out and a sign-in', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    fakes.meetings.onRequest = SLOW(fakes);

    const result = await new GetMeeting(fakes).execute({ meetingId: MEETING.id });

    expect(result).toEqual(err(sessionChanged()));
    expect(fakes.meetingCache.isEmpty()).toBe(true);
  });

  it('does the same for a page of the list', async () => {
    const fakes = world();
    fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [aMeetingSummary()]);
    fakes.meetings.onRequest = SLOW(fakes);

    const result = await new ListMeetings({ ...fakes }).execute({
      period: MEETING_PERIOD.Upcoming,
      request: FIRST_PAGE,
    });

    expect(result).toEqual(err(sessionChanged()));
    expect(fakes.meetingCache.isEmpty()).toBe(true);
  });

  it('does not answer from the cache of the previous owner either', async () => {
    const fakes = world();
    await fakes.meetingCache.saveMeeting(ALICE.id, MEETING, NOW);
    fakes.network.goOffline();
    fakes.meetings.onRequest = SLOW(fakes);

    const result = await new GetMeeting(fakes).execute({ meetingId: MEETING.id });

    expect(result).toEqual(err(sessionChanged()));
  });

  it('returns no content under the watermark of another user, and protects nothing for it', async () => {
    const fakes = world();
    fakes.documents.addDocument(aConfidentialDocument(), VIEWABLE.location);
    fakes.documents.onRequest = SLOW(fakes);

    const result = await new OpenDocument(fakes).execute({ documentId: aDocument().id });

    expect(result).toEqual(err(sessionChanged()));
    expect(fakes.screenProtection.enableCalls).toBe(0);
    expect(fakes.documentCache.isEmpty()).toBe(true);
  });

  it('builds the watermark from the session it checked after the call', async () => {
    const fakes = world();
    fakes.documents.addDocument(aConfidentialDocument(), VIEWABLE.location);
    // The metadata and the content are two requests: the clock moves during each one.
    fakes.documents.onRequest = () => {
      fakes.clock.advance(1000);
    };

    const opened = await new OpenDocument(fakes).execute({ documentId: aDocument().id });

    expect(opened.ok && opened.value.watermark).toEqual({
      fullName: ALICE.fullName,
      email: ALICE.email,
      viewedAt: at(2000),
    });
  });
});

describe('F6: the previous user does not leave their content on the device', () => {
  async function aliceLeavesContent(fakes: Fakes) {
    await fakes.meetingCache.saveMeeting(ALICE.id, MEETING, NOW);
    await fakes.documentCache.save(ALICE.id, VIEWABLE, NOW);
  }

  it('empties both caches when somebody signs in over another user session', async () => {
    const fakes = world();
    await aliceLeavesContent(fakes);

    const signedIn = await signInAsBruno(fakes);

    expect(signedIn.ok).toBe(true);
    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
  });

  it('keeps the caches when the sign-in is refused', async () => {
    const fakes = world();
    await aliceLeavesContent(fakes);

    await new SignIn(fakes).execute({ email: BRUNO.email, password: 'wrong' });

    expect(fakes.meetingCache.isEmpty()).toBe(false);
  });

  it('retries a purge that failed at sign-out', async () => {
    const fakes = world();
    await aliceLeavesContent(fakes);
    fakes.meetingCache.purgeFailure = storageWriteFailed();
    fakes.documentCache.purgeFailure = storageWriteFailed();
    await new SignOut(fakes).execute();
    expect(fakes.meetingCache.isEmpty()).toBe(false);
    fakes.meetingCache.purgeFailure = undefined;
    fakes.documentCache.purgeFailure = undefined;

    await signInAsBruno(fakes);

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
  });

  it('still signs the user in, and captures the failure, when the purge fails', async () => {
    const fakes = world();
    await aliceLeavesContent(fakes);
    fakes.meetingCache.purgeFailure = storageWriteFailed();

    const signedIn = await signInAsBruno(fakes);

    expect(signedIn.ok).toBe(true);
    expect(fakes.monitoring.capturedEvents()).toContain(MONITORING_EVENT.CachePurgeFailed);
  });

  it('empties both caches when a session expires while the app is running', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    await aliceLeavesContent(fakes);
    fakes.clock.advance(MILLIS_PER_HOUR);

    const result = await new GetMeeting(fakes).execute({ meetingId: MEETING.id });

    expect(result).toEqual(err(sessionExpired()));
    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
    expect(fakes.meetings.getCalls).toEqual([]);
  });

  it('still answers sessionExpired, and captures the failure, when that purge fails', async () => {
    const fakes = world();
    await aliceLeavesContent(fakes);
    fakes.documentCache.purgeFailure = storageWriteFailed();
    fakes.clock.advance(MILLIS_PER_HOUR);

    const result = await new ListPendingVotes(fakes).execute();

    expect(result).toEqual(err(sessionExpired()));
    expect(fakes.monitoring.capturedEvents()).toContain(MONITORING_EVENT.CachePurgeFailed);
  });
});

describe('F7: smaller leaks', () => {
  it('logs a screen capture with the user who is signed in when it happens', async () => {
    const fakes = world();
    await new ObserveScreenCapture(fakes).execute({ documentId: aDocumentId() }, () => undefined);
    await new SignOut(fakes).execute();
    await signInAsBruno(fakes);

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    await settle();

    expect(fakes.monitoring.logs[0]?.attributes?.[LOG_ATTRIBUTE.UserId]).toBe(BRUNO.id);
  });

  it('drops the attribution of a capture when nobody is signed in', async () => {
    const fakes = world();
    const onCapture = jest.fn();
    await new ObserveScreenCapture(fakes).execute({ documentId: aDocumentId() }, onCapture);
    await new SignOut(fakes).execute();

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStarted });
    await settle();

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(fakes.monitoring.logs).toHaveLength(1);
    expect(fakes.monitoring.logs[0]?.attributes).not.toHaveProperty(LOG_ATTRIBUTE.UserId);
  });

  it('refuses to cast a vote when another user signed in during the biometric prompt', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    fakes.biometricGate.onPrompt = async () => {
      await new SignOut(fakes).execute();
      await signInAsBruno(fakes);
    };

    const result = await new CastVote(fakes).execute({
      meetingId: MEETING.id,
      resolutionId: aResolutionId(),
      choice: VOTE_CHOICE.For,
    });

    expect(result).toEqual(err(sessionChanged()));
    expect(fakes.votes.received).toEqual([]);
    expect(fakes.outbox.snapshot()).toEqual([]);
  });

  it('refuses to cast a vote when the app was locked during the biometric prompt', async () => {
    const fakes = world();
    fakes.meetings.addMeeting(MEETING);
    fakes.biometricGate.onPrompt = () => {
      fakes.appLock.lock();
    };

    const result = await new CastVote(fakes).execute({
      meetingId: MEETING.id,
      resolutionId: aResolutionId(),
      choice: VOTE_CHOICE.For,
    });

    expect(result).toEqual(err(appLocked()));
    expect(fakes.votes.received).toEqual([]);
  });

  it('reports the resolutions and the reasons of a synchronisation, never the choices', async () => {
    const fakes = world();
    const second = aVote({
      resolutionId: aResolutionId('resolution-2'),
      choice: VOTE_CHOICE.Against,
    });
    fakes.outbox.seed(aPendingVote(), aPendingVote(second));
    fakes.votes.answerNext(ok(undefined));
    fakes.votes.answerNext(err({ code: 'resolutionClosed' }));

    const report = await new SyncPendingVotes({ ...fakes }).execute();

    expect(report.ok && report.value).toMatchObject({
      synced: [aResolutionId()],
      rejected: [
        { resolutionId: aResolutionId('resolution-2'), reason: { code: 'resolutionClosed' } },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('choice');
    expect(JSON.stringify(report)).not.toContain(VOTE_CHOICE.Against);
    expect(fakes.outbox.snapshot()[0]).toMatchObject({ status: OUTBOX_STATUS.Rejected });
  });
});
