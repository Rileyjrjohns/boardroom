import { invalidCredentials } from '@core/domain/errors/AuthenticationError';
import { notFound, networkUnavailable, unauthorized } from '@core/domain/errors/RepositoryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@core/domain/errors/VotingError';
import { err, ok } from '@core/domain/shared/Result';
import { createPage } from '@core/domain/value-objects/Page';
import { parsePageCursor } from '@core/domain/value-objects/PageCursor';
import { createPageRequest } from '@core/domain/value-objects/PageRequest';
import { DEFAULT_PASSWORD } from '@features/auth/application/testing/FakeAuthSession';
import { SCREEN_CAPTURE_KIND } from '@features/documents/application/ports/ScreenProtection';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { ENQUEUE_OUTCOME } from '@features/votes/application/ports/VoteOutbox';
import { OUTBOX_STATUS } from '@features/votes/domain/entities/OutboxVote';
import {
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aPendingVote,
  aRejectedVote,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
  anEmail,
  unwrap,
  MILLIS_PER_DAY,
  at,
} from '@testing/domain/builders';

import { createFakes } from './createFakes';

const PAGE_KEY = { period: MEETING_PERIOD.Past, limit: 20 } as const;

// The fakes stand in for the adapters in every use case test, so what they promise must match the
// contract written in the port. These tests check it.

describe('the fake remote sources', () => {
  it('fail with networkUnavailable while the network is off, and recover', async () => {
    const fakes = createFakes();
    fakes.meetings.addMeeting(aMeeting());
    fakes.documents.addDocument(aDocument(), aDocumentLocation());
    fakes.network.goOffline();

    expect(await fakes.meetings.get(aMeetingId())).toEqual(err(networkUnavailable()));
    expect(await fakes.meetings.list(MEETING_PERIOD.Upcoming, { limit: 20 })).toEqual(
      err(networkUnavailable()),
    );
    expect(await fakes.documents.get(aDocument().id)).toEqual(err(networkUnavailable()));
    expect(await fakes.documents.fetchContent(aDocument().id)).toEqual(err(networkUnavailable()));
    expect(await fakes.votes.submit(aVote())).toEqual(err(networkUnavailable()));

    fakes.network.goOnline();
    expect(await fakes.meetings.get(aMeetingId())).toEqual(ok(aMeeting()));
  });

  it('answer notFound for what they do not hold, and the scripted failure for everything else', async () => {
    const fakes = createFakes();

    expect(await fakes.meetings.get(aMeetingId())).toEqual(err(notFound()));
    expect(await fakes.documents.get(aDocument().id)).toEqual(err(notFound()));
    expect(await fakes.documents.fetchContent(aDocument().id)).toEqual(err(notFound()));

    fakes.meetings.failure = unauthorized();
    fakes.documents.failure = unauthorized();
    expect(await fakes.meetings.get(aMeetingId())).toEqual(err(unauthorized()));
    expect(await fakes.meetings.list(MEETING_PERIOD.Past, { limit: 5 })).toEqual(
      err(unauthorized()),
    );
    expect(await fakes.documents.get(aDocument().id)).toEqual(err(unauthorized()));
  });

  describe('the list of meetings', () => {
    const upcoming = (id: string, days: number) =>
      aMeetingSummary({ id: aMeetingId(id), scheduledAt: at(days * MILLIS_PER_DAY) });
    const [u1, u2, u3, u4] = [
      upcoming('u1', 1),
      upcoming('u2', 2),
      upcoming('u3', 3),
      upcoming('u4', 4),
    ];
    const request = (limit: number, cursor?: string) =>
      unwrap(
        createPageRequest(
          cursor === undefined ? { limit } : { limit, cursor: unwrap(parsePageCursor(cursor)) },
        ),
      );
    const itemsOf = async (
      fakes: ReturnType<typeof createFakes>,
      period: typeof MEETING_PERIOD.Upcoming | typeof MEETING_PERIOD.Past,
      page: ReturnType<typeof request>,
    ) => {
      const result = await fakes.meetings.list(period, page);
      return result.ok ? result.value : result.error;
    };

    it('sorts the upcoming meetings soonest first, whatever order it was given them in', async () => {
      const fakes = createFakes();
      fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [u3, u1, u4, u2]);

      expect(await itemsOf(fakes, MEETING_PERIOD.Upcoming, request(10))).toEqual(
        createPage([u1, u2, u3, u4]),
      );
    });

    it('sorts the past meetings latest first', async () => {
      const fakes = createFakes();
      const [p1, p2, p3] = [upcoming('p1', -1), upcoming('p2', -2), upcoming('p3', -3)];
      fakes.meetings.setMeetings(MEETING_PERIOD.Past, [p2, p3, p1]);

      expect(await itemsOf(fakes, MEETING_PERIOD.Past, request(10))).toEqual(
        createPage([p1, p2, p3]),
      );
    });

    it('cuts the list to the size of the page, and gives the cursor to the next one only when there is more', async () => {
      const fakes = createFakes();
      fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [u1, u2, u3, u4]);

      expect(await itemsOf(fakes, MEETING_PERIOD.Upcoming, request(2))).toEqual(
        createPage([u1, u2], unwrap(parsePageCursor('u2'))),
      );
      expect(await itemsOf(fakes, MEETING_PERIOD.Upcoming, request(1))).toEqual(
        createPage([u1], unwrap(parsePageCursor('u1'))),
      );
      expect(await itemsOf(fakes, MEETING_PERIOD.Upcoming, request(4))).toEqual(
        createPage([u1, u2, u3, u4]),
      );
    });

    it('continues after the cursor', async () => {
      const fakes = createFakes();
      fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [u1, u2, u3, u4]);

      expect(await itemsOf(fakes, MEETING_PERIOD.Upcoming, request(2, 'u2'))).toEqual(
        createPage([u3, u4]),
      );
      expect(await itemsOf(fakes, MEETING_PERIOD.Upcoming, request(1, 'u3'))).toEqual(
        createPage([u4]),
      );
    });

    it('gives an empty page for a cursor that matches nothing, for a period without meetings', async () => {
      const fakes = createFakes();
      fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [u1, u2]);

      expect(await itemsOf(fakes, MEETING_PERIOD.Upcoming, request(2, 'unknown'))).toEqual(
        createPage([]),
      );
      expect(await itemsOf(fakes, MEETING_PERIOD.Past, request(2))).toEqual(createPage([]));
    });

    it('records the calls it receives', async () => {
      const fakes = createFakes();

      await itemsOf(fakes, MEETING_PERIOD.Past, request(3));

      expect(fakes.meetings.listCalls).toEqual([
        { period: MEETING_PERIOD.Past, request: request(3) },
      ]);
    });
  });
});

describe('the fake auth session', () => {
  const SESSION = aSession({
    user: aUser({ id: aUserId('user-2'), email: anEmail('bruno@example.com') }),
  });

  it('signs in an account the test registered, and opens its session', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;
    fakes.auth.registerAccount(anEmail('bruno@example.com'), '  p4ss  ', SESSION);

    expect(
      await fakes.auth.signIn({ email: anEmail('bruno@example.com'), password: '  p4ss  ' }),
    ).toEqual(ok(SESSION));
    expect(fakes.auth.session).toEqual(SESSION);
  });

  it('knows the default account', async () => {
    const fakes = createFakes();

    expect(await fakes.auth.signIn({ email: anEmail(), password: DEFAULT_PASSWORD })).toEqual(
      ok(aSession()),
    );
  });

  it.each([
    ['a wrong password', anEmail(), 'Secret'],
    ['a password that was trimmed', anEmail(), 'secret '],
    ['an email nobody registered', anEmail('nobody@example.com'), DEFAULT_PASSWORD],
  ])('refuses %s, and signs nobody in', async (_name, email, password) => {
    const fakes = createFakes();
    fakes.auth.session = undefined;

    expect(await fakes.auth.signIn({ email, password })).toEqual(err(invalidCredentials()));
    expect(fakes.auth.session).toBeUndefined();
    expect(fakes.auth.signInCalls).toEqual([{ email, password }]);
  });

  it('fails with the scripted failure, whatever the credentials', async () => {
    const fakes = createFakes();
    fakes.auth.signInFailure = networkUnavailable();

    expect(await fakes.auth.signIn({ email: anEmail(), password: DEFAULT_PASSWORD })).toEqual(
      err(networkUnavailable()),
    );
  });
});

describe('the fake vote repository', () => {
  it('is idempotent on the key: the same vote twice is recorded once, both times successfully', async () => {
    const fakes = createFakes();

    expect(await fakes.votes.submit(aVote())).toEqual(ok(undefined));
    expect(await fakes.votes.submit(aVote())).toEqual(ok(undefined));

    expect(fakes.votes.recordedVotes()).toEqual([aVote()]);
  });

  it('rejects a different choice under the same key as already voted, and keeps the first vote', async () => {
    const fakes = createFakes();
    await fakes.votes.submit(aVote({ choice: VOTE_CHOICE.For }));

    const second = await fakes.votes.submit(aVote({ choice: VOTE_CHOICE.Against }));

    expect(second).toEqual(
      err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded }),
    );
    expect(fakes.votes.recordedVotes().map((vote) => vote.choice)).toEqual([VOTE_CHOICE.For]);
  });

  it('answers unauthorized, not a voting error, to a vote whose voter is not the authenticated user', async () => {
    const fakes = createFakes();

    expect(await fakes.votes.submit(aVote({ voterId: aUserId('user-2') }))).toEqual(
      err(unauthorized()),
    );
    fakes.auth.session = undefined;
    expect(await fakes.votes.submit(aVote())).toEqual(err(unauthorized()));
    expect(fakes.votes.recordedVotes()).toEqual([]);
  });

  it('records a vote per resolution', async () => {
    const fakes = createFakes();

    await fakes.votes.submit(aVote({ resolutionId: aResolutionId('r1') }));
    await fakes.votes.submit(aVote({ resolutionId: aResolutionId('r2') }));

    expect(fakes.votes.recordedVotes()).toHaveLength(2);
  });

  it('plays the scripted answers first, in order, then behaves normally', async () => {
    const fakes = createFakes();
    fakes.votes.answerNext(err(networkUnavailable()));
    fakes.votes.answerNext(ok(undefined));

    expect(await fakes.votes.submit(aVote())).toEqual(err(networkUnavailable()));
    expect(fakes.votes.recordedVotes()).toEqual([]);
    expect(await fakes.votes.submit(aVote())).toEqual(ok(undefined));
    expect(fakes.votes.recordedVotes()).toEqual([aVote()]);
    expect(await fakes.votes.submit(aVote({ resolutionId: aResolutionId('r2') }))).toEqual(
      ok(undefined),
    );
    expect(fakes.votes.received).toHaveLength(3);
  });

  it('calls the hook with each vote before it answers', async () => {
    const fakes = createFakes();
    const seen: string[] = [];
    fakes.votes.onReceive = (vote) => seen.push(vote.resolutionId);

    await fakes.votes.submit(aVote({ resolutionId: aResolutionId('r1') }));

    expect(seen).toEqual(['r1']);
  });
});

describe('the fake vote outbox', () => {
  const first = aPendingVote(aVote({ resolutionId: aResolutionId('r1') }), at(-2000));
  const second = aPendingVote(aVote({ resolutionId: aResolutionId('r2') }), at(-1000));
  const others = aPendingVote(
    aVote({ voterId: aUserId('user-2'), resolutionId: aResolutionId('r1') }),
  );

  it('lists the votes in the order they were enqueued, which no sort of the votes would give', async () => {
    const fakes = createFakes();
    // Enqueued in this order, the votes are in decreasing order of instant and in no order of
    // resolution: a sort by instant, by resolution or by key would give another.
    const enqueuedFirst = aPendingVote(aVote({ resolutionId: aResolutionId('r9') }), at(5000));
    const enqueuedSecond = aPendingVote(aVote({ resolutionId: aResolutionId('r1') }), at(1000));
    const enqueuedThird = aPendingVote(aVote({ resolutionId: aResolutionId('r5') }), at(-9000));

    await fakes.outbox.enqueue(enqueuedFirst);
    await fakes.outbox.enqueue(enqueuedSecond);
    await fakes.outbox.enqueue(enqueuedThird);

    expect(await fakes.outbox.list(aUserId())).toEqual(
      ok({ votes: [enqueuedFirst, enqueuedSecond, enqueuedThird], unreadable: 0 }),
    );
    expect(await fakes.outbox.findByResolution(aResolutionId('r1'), aUserId())).toEqual(
      ok([enqueuedSecond]),
    );
  });

  it('only ever returns the votes of the voter it is asked for', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(first, others, second);

    expect(await fakes.outbox.list(aUserId())).toEqual(
      ok({ votes: [first, second], unreadable: 0 }),
    );
    expect(await fakes.outbox.list(aUserId('user-2'))).toEqual(
      ok({ votes: [others], unreadable: 0 }),
    );
    expect(await fakes.outbox.list(aUserId('user-3'))).toEqual(ok({ votes: [], unreadable: 0 }));
    expect(await fakes.outbox.findByResolution(aResolutionId('r1'), aUserId())).toEqual(
      ok([first]),
    );
    expect(await fakes.outbox.findByResolution(aResolutionId('r1'), aUserId('user-2'))).toEqual(
      ok([others]),
    );
    expect(await fakes.outbox.findByResolution(aResolutionId('r2'), aUserId('user-2'))).toEqual(
      ok([]),
    );
  });

  it('says whether it enqueued the vote, or a vote with the same key was already there', async () => {
    const fakes = createFakes();

    expect(await fakes.outbox.enqueue(first)).toEqual(ok({ outcome: ENQUEUE_OUTCOME.Enqueued }));
    expect(
      await fakes.outbox.enqueue(
        aPendingVote(
          aVote({ resolutionId: aResolutionId('r1'), choice: VOTE_CHOICE.Against }),
          NOW,
        ),
      ),
    ).toEqual(ok({ outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing: first }));

    expect(fakes.outbox.snapshot()).toEqual([first]);
  });

  it('holds the key of a rejected vote too', async () => {
    const fakes = createFakes();
    const rejected = aRejectedVote(aVote({ resolutionId: aResolutionId('r1') }));
    fakes.outbox.seed(rejected);

    expect(await fakes.outbox.enqueue(first)).toEqual(
      ok({ outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing: rejected }),
    );
  });

  it('counts an attempt every time markAttempt is called: it is not idempotent', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(first);

    await fakes.outbox.markAttempt(first.vote.idempotencyKey);
    await fakes.outbox.markAttempt(first.vote.idempotencyKey);

    expect(fakes.outbox.snapshot()).toEqual([{ ...first, attempts: 2 }]);
  });

  it('moves a pending vote to the rejected state, once, and ignores an unknown key', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(first, second);
    const reason = { code: VOTING_ERROR_CODE.ResolutionClosed } as const;

    await fakes.outbox.reject(first.vote.idempotencyKey, reason, at(10));
    await fakes.outbox.reject(
      first.vote.idempotencyKey,
      { code: VOTING_ERROR_CODE.NoVotingRights },
      at(20),
    );
    await fakes.outbox.reject(
      aVote({ resolutionId: aResolutionId('zz') }).idempotencyKey,
      reason,
      at(30),
    );

    expect(fakes.outbox.snapshot()).toEqual([
      {
        status: OUTBOX_STATUS.Rejected,
        vote: first.vote,
        enqueuedAt: first.enqueuedAt,
        attempts: 0,
        reason,
        rejectedAt: at(10),
      },
      second,
    ]);
  });

  it('does not count an attempt on a rejected vote', async () => {
    const fakes = createFakes();
    const rejected = aRejectedVote();
    fakes.outbox.seed(rejected);

    await fakes.outbox.markAttempt(rejected.vote.idempotencyKey);

    expect(fakes.outbox.snapshot()).toEqual([rejected]);
  });

  it('removes a vote, pending or rejected, and ignores an unknown key', async () => {
    const fakes = createFakes();
    const rejected = aRejectedVote(aVote({ resolutionId: aResolutionId('r3') }));
    fakes.outbox.seed(first, rejected, second);

    await fakes.outbox.remove(rejected.vote.idempotencyKey);
    await fakes.outbox.remove(rejected.vote.idempotencyKey);
    await fakes.outbox.remove(first.vote.idempotencyKey);

    expect(fakes.outbox.snapshot()).toEqual([second]);
  });
});

describe('the fake caches', () => {
  const OWNER = aUserId();
  const OTHER = aUserId('user-2');

  it('return a miss as a value, not as an error', async () => {
    const fakes = createFakes();

    expect(await fakes.meetingCache.readMeeting(OWNER, aMeetingId())).toEqual(ok(undefined));
    expect(await fakes.meetingCache.readPage(OWNER, PAGE_KEY)).toEqual(ok(undefined));
    expect(await fakes.documentCache.read(OWNER, aDocument().id)).toEqual(ok(undefined));
  });

  it('give back what was saved, with the instant it was saved at', async () => {
    const fakes = createFakes();
    const page = createPage([aMeetingSummary()]);
    const viewable = { document: aDocument(), location: aDocumentLocation() };

    await fakes.meetingCache.saveMeeting(OWNER, aMeeting(), at(10));
    await fakes.meetingCache.savePage(OWNER, PAGE_KEY, page, at(20));
    await fakes.documentCache.save(OWNER, viewable, at(30));

    expect(await fakes.meetingCache.readMeeting(OWNER, aMeetingId())).toEqual(
      ok({ value: aMeeting(), cachedAt: at(10) }),
    );
    expect(await fakes.meetingCache.readPage(OWNER, PAGE_KEY)).toEqual(
      ok({ value: page, cachedAt: at(20) }),
    );
    expect(await fakes.documentCache.read(OWNER, aDocument().id)).toEqual(
      ok({ value: viewable, cachedAt: at(30) }),
    );
  });

  it('keep the entries of each owner apart: another owner reads a miss', async () => {
    const fakes = createFakes();
    const page = createPage([aMeetingSummary()]);
    const viewable = { document: aDocument(), location: aDocumentLocation() };
    await fakes.meetingCache.saveMeeting(OWNER, aMeeting(), at(10));
    await fakes.meetingCache.savePage(OWNER, PAGE_KEY, page, at(20));
    await fakes.documentCache.save(OWNER, viewable, at(30));

    expect(await fakes.meetingCache.readMeeting(OTHER, aMeetingId())).toEqual(ok(undefined));
    expect(await fakes.meetingCache.readPage(OTHER, PAGE_KEY)).toEqual(ok(undefined));
    expect(await fakes.documentCache.read(OTHER, aDocument().id)).toEqual(ok(undefined));
  });

  it('include the page size in the key of a page', async () => {
    const fakes = createFakes();
    await fakes.meetingCache.savePage(OWNER, PAGE_KEY, createPage([]), at(1));

    expect(await fakes.meetingCache.readPage(OWNER, { ...PAGE_KEY, limit: 21 })).toEqual(
      ok(undefined),
    );
  });

  it('remove one entry of one owner, and succeed when it is absent', async () => {
    const fakes = createFakes();
    const viewable = { document: aDocument(), location: aDocumentLocation() };
    await fakes.meetingCache.saveMeeting(OWNER, aMeeting(), at(10));
    await fakes.meetingCache.saveMeeting(OTHER, aMeeting(), at(10));
    await fakes.meetingCache.savePage(OWNER, PAGE_KEY, createPage([]), at(20));
    await fakes.documentCache.save(OWNER, viewable, at(30));

    expect(await fakes.meetingCache.removeMeeting(OWNER, aMeetingId())).toEqual(ok(undefined));
    expect(await fakes.meetingCache.removeMeeting(OWNER, aMeetingId())).toEqual(ok(undefined));
    await fakes.meetingCache.removePage(OWNER, PAGE_KEY);
    await fakes.documentCache.remove(OWNER, aDocument().id);

    expect(await fakes.meetingCache.readMeeting(OWNER, aMeetingId())).toEqual(ok(undefined));
    expect(await fakes.meetingCache.readPage(OWNER, PAGE_KEY)).toEqual(ok(undefined));
    expect(await fakes.documentCache.read(OWNER, aDocument().id)).toEqual(ok(undefined));
    expect(await fakes.meetingCache.readMeeting(OTHER, aMeetingId())).toEqual(
      ok({ value: aMeeting(), cachedAt: at(10) }),
    );
  });

  it('purge every entry of every owner', async () => {
    const fakes = createFakes();
    await fakes.meetingCache.saveMeeting(OWNER, aMeeting(), at(10));
    await fakes.meetingCache.saveMeeting(OTHER, aMeeting(), at(10));
    await fakes.meetingCache.savePage(OWNER, PAGE_KEY, createPage([]), at(20));
    await fakes.documentCache.save(
      OTHER,
      { document: aDocument(), location: aDocumentLocation() },
      at(30),
    );

    expect(await fakes.meetingCache.purge()).toEqual(ok(undefined));
    expect(await fakes.documentCache.purge()).toEqual(ok(undefined));

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
  });
});

describe('the fake clock', () => {
  it('only moves when it is told to', () => {
    const fakes = createFakes();

    expect(fakes.clock.now()).toBe(NOW);
    expect(fakes.clock.now()).toBe(NOW);
    fakes.clock.advance(1500);
    expect(fakes.clock.now()).toBe(at(1500));
    fakes.clock.set(at(-5));
    expect(fakes.clock.now()).toBe(at(-5));
  });
});

describe('the fake screen protection', () => {
  it('stops calling a listener after its unsubscribe, which can be called twice', () => {
    const fakes = createFakes();
    const received: string[] = [];
    const unsubscribe = fakes.screenProtection.subscribe((event) => received.push(event.kind));

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    unsubscribe();
    unsubscribe();
    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStarted });

    expect(received).toEqual([SCREEN_CAPTURE_KIND.ScreenshotTaken]);
  });
});
