import { describeDocumentRepositoryContract } from '@application/testing/contracts/documentRepositoryContract';
import { describeMeetingRepositoryContract } from '@application/testing/contracts/meetingRepositoryContract';
import { describeVoteRepositoryContract } from '@application/testing/contracts/voteRepositoryContract';
import { aMeeting, aUser } from '@domain/testing/builders';

import { createTestServer } from '../testing/testServer';

// The three repositories are windows on one simulated server. Each runs the contract suite of its
// port, with the server prepared the way the suite asks.

describeMeetingRepositoryContract('InMemoryMeetingRepository', () => {
  const server = createTestServer();
  return {
    repository: server.meetings,
    now: server.clock.now(),
    serve: (meetings) => server.backend.replaceContent({ meetings, recordedVotes: [] }),
    setOnline: (online) => server.network.setOnline(online),
    refuseCaller: async () => {
      await server.auth.signOut();
    },
  };
});

describeDocumentRepositoryContract('InMemoryDocumentRepository', () => {
  const server = createTestServer();
  return {
    repository: server.documents,
    serve: (documents) =>
      server.backend.replaceContent({
        meetings: [aMeeting({ documents: [...documents] })],
        recordedVotes: [],
      }),
    setOnline: (online) => server.network.setOnline(online),
    refuseCaller: async () => {
      await server.auth.signOut();
    },
  };
});

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
      serve: (meeting) => server.backend.replaceContent({ meetings: [meeting], recordedVotes: [] }),
      recordedCount: (vote) =>
        server.backend.recordedVotes().filter((held) => held.idempotencyKey === vote.idempotencyKey)
          .length,
    };
  },
  { enforcesBusinessRules: true },
);
