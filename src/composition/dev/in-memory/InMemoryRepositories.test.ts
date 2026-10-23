import { describeDocumentRepositoryContract } from '@features/documents/application/testing/contracts/documentRepositoryContract';
import { describeMeetingRepositoryContract } from '@features/meetings/application/testing/contracts/meetingRepositoryContract';
import { describeVoteRepositoryContract } from '@features/votes/application/testing/contracts/voteRepositoryContract';
import { aUser } from '@testing/domain/builders';
import {
  documentsServerSide,
  meetingsServerSide,
  votesServerSide,
} from '@testing/infrastructure/serverSetups';
import { createTestServer } from '@testing/infrastructure/testServer';

// The three repositories are windows on one simulated server. Each runs the contract suite of its
// port, with the server prepared the way the suite asks.

describeMeetingRepositoryContract(
  'InMemoryMeetingRepository',
  () => {
    const server = createTestServer();
    return {
      ...meetingsServerSide(server),
      repository: server.meetings,
      now: server.clock.now(),
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
    return {
      ...documentsServerSide(server),
      repository: server.documents,
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
      ...votesServerSide(server),
      repository: server.votes,
      now: server.clock.now(),
      setOnline: (online) => server.network.setOnline(online),
      signOut: async () => {
        await server.auth.signOut();
      },
      authenticateAs: (userId) => {
        server.auth.openSessionFor(aUser({ id: userId }));
      },
      advanceClock: (millis) => server.clock.advance(millis),
    };
  },
  { enforcesBusinessRules: true },
);
