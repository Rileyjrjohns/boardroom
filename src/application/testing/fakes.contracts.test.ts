import type { Document } from '@domain/entities/Document';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import { networkUnavailable, unauthorized } from '@domain/errors/RepositoryError';
import { storageWriteFailed } from '@domain/errors/StorageError';
import { aDocumentLocation, aSession, aUser, aUserId, anEmail } from '@domain/testing/builders';
import type { MeetingId } from '@domain/value-objects/ids';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';

import { describeAuthSessionContract } from './contracts/authSessionContract';
import { describeDocumentCacheContract } from './contracts/documentCacheContract';
import { describeDocumentRepositoryContract } from './contracts/documentRepositoryContract';
import { describeMeetingCacheContract } from './contracts/meetingCacheContract';
import { describeMeetingRepositoryContract } from './contracts/meetingRepositoryContract';
import { describeScreenProtectionContract } from './contracts/screenProtectionContract';
import { describeVoteOutboxContract } from './contracts/voteOutboxContract';
import { describeVoteRepositoryContract } from './contracts/voteRepositoryContract';
import { createFakes } from './createFakes';
import { FakeDocumentCache } from './FakeDocumentCache';
import { FakeMeetingCache } from './FakeMeetingCache';
import { FakeScreenProtection } from './FakeScreenProtection';
import { FakeVoteOutbox } from './FakeVoteOutbox';

// The fakes stand in for the adapters in every use case test, so what they promise must match the
// contract written in the ports. The suites that check it are the ones the real adapters run too
// (src/application/testing/contracts).

describeMeetingCacheContract('FakeMeetingCache', () => {
  const cache = new FakeMeetingCache();
  return {
    cache,
    breakWrites: () => {
      cache.writeFailure = storageWriteFailed();
    },
    repairWrites: () => {
      cache.writeFailure = undefined;
    },
  };
});

describeDocumentCacheContract(
  'FakeDocumentCache',
  () => {
    const cache = new FakeDocumentCache();
    return {
      cache,
      breakWrites: () => {
        cache.writeFailure = storageWriteFailed();
      },
      repairWrites: () => {
        cache.writeFailure = undefined;
      },
    };
  },
  { keepsFiles: false },
);

describeVoteOutboxContract('FakeVoteOutbox', () => new FakeVoteOutbox());

describeMeetingRepositoryContract(
  'FakeMeetingRepository',
  () => {
    const fakes = createFakes();
    const now = fakes.clock.now();
    const served = new Set<MeetingId>();
    return {
      repository: fakes.meetings,
      now,
      serve(meetings) {
        for (const id of served) fakes.meetings.removeMeeting(id);
        served.clear();
        const upcoming: MeetingSummary[] = [];
        const past: MeetingSummary[] = [];
        for (const meeting of meetings) {
          fakes.meetings.addMeeting(meeting);
          served.add(meeting.id);
          const { id, title, scheduledAt, location } = meeting;
          (scheduledAt > now ? upcoming : past).push({ id, title, scheduledAt, location });
        }
        fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, upcoming);
        fakes.meetings.setMeetings(MEETING_PERIOD.Past, past);
      },
      forbid(meeting) {
        fakes.meetings.addMeeting(meeting);
        fakes.meetings.forbid(meeting.id);
      },
      recordVote() {
        // The scripted server returns the meetings it was given: it cannot project a vote.
      },
      signInAs(userId) {
        fakes.auth.session = aSession({ user: aUser({ id: userId }) });
      },
      setOnline(online) {
        fakes.network.online = online;
      },
      refuseCaller() {
        fakes.meetings.failure = unauthorized();
      },
    };
  },
  { projectsRecordedVotes: false },
);

describeDocumentRepositoryContract(
  'FakeDocumentRepository',
  () => {
    const fakes = createFakes();
    const location = (document: Document) =>
      aDocumentLocation(`file:///documents/${document.id}.pdf`);
    return {
      repository: fakes.documents,
      serve(documents) {
        for (const document of documents) fakes.documents.addDocument(document, location(document));
      },
      forbid(document) {
        fakes.documents.addDocument(document, location(document));
        fakes.documents.forbid(document.id);
      },
      signInAs(userId) {
        fakes.auth.session = aSession({ user: aUser({ id: userId }) });
      },
      setOnline(online) {
        fakes.network.online = online;
      },
      refuseCaller() {
        fakes.documents.failure = unauthorized();
      },
    };
  },
  // The locations of the fake are given by the test: it downloads nothing.
  { downloadsPerUserAndVersion: false },
);

describeVoteRepositoryContract(
  'FakeVoteRepository',
  () => {
    const fakes = createFakes();
    return {
      repository: fakes.votes,
      now: fakes.clock.now(),
      setOnline(online) {
        fakes.network.online = online;
      },
      signOut() {
        fakes.auth.session = undefined;
      },
      authenticateAs(userId) {
        fakes.auth.session = aSession({ user: aUser({ id: userId }) });
      },
      serve() {
        // The scripted server holds no meeting.
      },
      change() {
        // The scripted server holds no meeting.
      },
      advanceClock: (millis) => fakes.clock.advance(millis),
      recordedCount: (vote) =>
        fakes.votes.recordedVotes().filter((held) => held.idempotencyKey === vote.idempotencyKey)
          .length,
    };
  },
  { enforcesBusinessRules: false },
);

describeAuthSessionContract('FakeAuthSession', () => {
  const fakes = createFakes();
  fakes.auth.session = undefined;
  const alice = aUser();
  const bruno = aUser({
    id: aUserId('user-2'),
    fullName: 'Bruno Durand',
    email: anEmail('bruno@example.com'),
  });
  const accounts = [
    { credentials: { email: alice.email, password: 'alice-secret' }, user: alice },
    { credentials: { email: bruno.email, password: 'bruno-secret' }, user: bruno },
  ] as const;
  for (const { credentials, user } of accounts) {
    fakes.auth.registerAccount(credentials.email, credentials.password, aSession({ user }));
  }
  return {
    auth: fakes.auth,
    accounts,
    now: () => fakes.clock.now(),
    advanceClock: (millis) => fakes.clock.advance(millis),
    setOnline(online) {
      fakes.auth.signInFailure = online ? undefined : networkUnavailable();
    },
  };
});

describeScreenProtectionContract('FakeScreenProtection', () => {
  const protection = new FakeScreenProtection();
  return {
    protection,
    isEnabled: () => protection.enabled,
    emit: (event) => protection.emit(event),
  };
});
