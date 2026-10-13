import { describeAuthSessionContract } from '@application/testing/contracts/authSessionContract';
import { describeDocumentRepositoryContract } from '@application/testing/contracts/documentRepositoryContract';
import { describeMeetingRepositoryContract } from '@application/testing/contracts/meetingRepositoryContract';
import { describeVoteRepositoryContract } from '@application/testing/contracts/voteRepositoryContract';
import { aUserId } from '@domain/testing/builders';

import { documentsServerSide, meetingsServerSide, votesServerSide } from '../testing/serverSetups';
import { credentialsOf } from '../testing/testServer';
import { createHttpWorld, installMockApi } from '../testing/httpWorld';

// The HTTP adapters run the same contract suites as the fakes and the in-memory adapters. The
// server behind them is the simulated one, reached through the routes of the API (`MockApi`) and
// MSW, so a request goes through the real client, the real schemas and the real mappers, and is
// answered by the same rules as the in-memory repositories.

const installed = installMockApi();

/** A device that has no connection: its requests fail the way `fetch` does. */
const setOnline = (online: boolean): void => {
  installed.conditions.online = online;
};

describeMeetingRepositoryContract(
  'HttpMeetingRepository',
  async () => {
    const world = await createHttpWorld(installed);
    await world.signInAs(aUserId('user-1'));
    return {
      ...meetingsServerSide(world),
      repository: world.meetings,
      now: world.clock.now(),
      signInAs: world.signInAs,
      setOnline,
      refuseCaller: () => world.api.revokeSessions(),
    };
  },
  { projectsRecordedVotes: true },
);

describeDocumentRepositoryContract(
  'HttpDocumentRepository',
  async () => {
    const world = await createHttpWorld(installed);
    await world.signInAs(aUserId('user-1'));
    return {
      ...documentsServerSide(world),
      repository: world.documents,
      signInAs: world.signInAs,
      setOnline,
      refuseCaller: () => world.api.revokeSessions(),
    };
  },
  { downloadsPerUserAndVersion: true },
);

describeVoteRepositoryContract(
  'HttpVoteRepository',
  async () => {
    const world = await createHttpWorld(installed);
    await world.signInAs(aUserId('user-1'));
    return {
      ...votesServerSide(world),
      repository: world.votes,
      now: world.clock.now(),
      setOnline,
      signOut: async () => {
        await world.auth.signOut();
      },
      authenticateAs: world.signInAs,
      advanceClock: (millis) => world.clock.advance(millis),
    };
  },
  { enforcesBusinessRules: true },
);

describeAuthSessionContract('HttpAuthSession', async () => {
  const world = await createHttpWorld(installed);
  const [alice, bruno] = world.accounts;
  if (alice === undefined || bruno === undefined)
    throw new Error('The test server has no account.');
  return {
    auth: world.auth,
    accounts: [
      { credentials: credentialsOf(alice), user: alice.user },
      { credentials: credentialsOf(bruno), user: bruno.user },
    ],
    now: () => world.clock.now(),
    advanceClock: (millis) => world.clock.advance(millis),
    setOnline,
  };
});
