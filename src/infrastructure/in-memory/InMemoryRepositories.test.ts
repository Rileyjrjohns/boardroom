import { describeDocumentRepositoryContract } from '@application/testing/contracts/documentRepositoryContract';
import { describeMeetingRepositoryContract } from '@application/testing/contracts/meetingRepositoryContract';
import { describeVoteRepositoryContract } from '@application/testing/contracts/voteRepositoryContract';
import type { Document } from '@domain/entities/Document';
import type { Meeting } from '@domain/entities/Meeting';
import type { Vote } from '@domain/entities/Vote';
import {
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aParticipant,
  aUser,
  aUserId,
} from '@domain/testing/builders';

import { createTestServer } from '../testing/testServer';

// The three repositories are windows on one simulated server. Each runs the contract suite of its
// port, with the server prepared the way the suite asks.

/** A meeting that the signed-in user (`user-1`) is not invited to. */
const withoutTheUser = (meeting: Meeting): Meeting => ({
  ...meeting,
  participants: [aParticipant({ userId: aUserId('user-9'), fullName: 'Someone Else' })],
});

describeMeetingRepositoryContract(
  'InMemoryMeetingRepository',
  () => {
    const server = createTestServer();
    let served: readonly Meeting[] = [];
    let refused: readonly Meeting[] = [];
    let recorded: readonly Vote[] = [];
    const load = () => server.load({ meetings: [...served, ...refused], recordedVotes: recorded });
    return {
      repository: server.meetings,
      now: server.clock.now(),
      serve: (meetings) => {
        served = meetings;
        load();
      },
      forbid: (meeting) => {
        refused = [...refused, withoutTheUser(meeting)];
        load();
      },
      recordVote: (vote) => {
        recorded = [...recorded, vote];
        load();
      },
      signInAs: (userId) => {
        server.auth.openSessionFor(aUser({ id: userId }));
      },
      setOnline: (online) => server.network.setOnline(online),
      refuseCaller: async () => {
        await server.auth.signOut();
      },
    };
  },
  { projectsRecordedVotes: true },
);

describeDocumentRepositoryContract(
  'InMemoryDocumentRepository',
  () => {
    const server = createTestServer();
    let served: readonly Document[] = [];
    let refused: readonly Document[] = [];
    const load = () =>
      server.load({
        meetings: [
          aMeeting({ documents: [...served] }),
          ...refused.map((document) =>
            withoutTheUser(
              aMeeting({
                summary: aMeetingSummary({ id: aMeetingId(`refused-${document.id}`) }),
                agenda: [],
                documents: [document],
              }),
            ),
          ),
        ],
        recordedVotes: [],
      });
    return {
      repository: server.documents,
      serve: (documents) => {
        served = documents;
        load();
      },
      forbid: (document) => {
        refused = [...refused, document];
        load();
      },
      signInAs: (userId) => {
        server.auth.openSessionFor(aUser({ id: userId }));
      },
      setOnline: (online) => server.network.setOnline(online),
      refuseCaller: async () => {
        await server.auth.signOut();
      },
    };
  },
  { downloadsPerUserAndVersion: true },
);

describeVoteRepositoryContract(
  'InMemoryVoteRepository',
  () => {
    const server = createTestServer();
    return {
      repository: server.votes,
      now: server.clock.now(),
      setOnline: (online) => server.network.setOnline(online),
      signOut: async () => {
        await server.auth.signOut();
      },
      authenticateAs: (userId) => {
        server.auth.openSessionFor(aUser({ id: userId }));
      },
      serve: (meeting) => {
        server.load({ meetings: [meeting], recordedVotes: [] });
      },
      change: (meeting) => {
        server.load({ meetings: [meeting], recordedVotes: server.backend.recordedVotes() });
      },
      advanceClock: (millis) => server.clock.advance(millis),
      recordedCount: (vote) =>
        server.backend.recordedVotes().filter((held) => held.idempotencyKey === vote.idempotencyKey)
          .length,
    };
  },
  { enforcesBusinessRules: true },
);
