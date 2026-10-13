import type { Document } from '@domain/entities/Document';
import type { Meeting } from '@domain/entities/Meeting';
import type { Vote } from '@domain/entities/Vote';
import {
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aParticipant,
  aUserId,
} from '@domain/testing/builders';

import type { createTestServer } from './testServer';

// Test support, not production code: how the contract suites of the remote repositories prepare
// the content of the simulated server. They are the same whether the repository reaches the server
// directly (the in-memory adapters) or over HTTP, so they live here once.

/** What the set-ups use of a test server: load content, and read what it recorded. */
type TestServer = Pick<ReturnType<typeof createTestServer>, 'load' | 'backend'>;

/** A meeting that the signed-in user (`user-1`) is not invited to. */
function withoutTheUser(meeting: Meeting): Meeting {
  return {
    ...meeting,
    participants: [aParticipant({ userId: aUserId('user-9'), fullName: 'Someone Else' })],
  };
}

/** What the harness of `MeetingRepository` asks of the server: the meetings and the votes it holds. */
export function meetingsServerSide(server: TestServer) {
  let served: readonly Meeting[] = [];
  let refused: readonly Meeting[] = [];
  let recorded: readonly Vote[] = [];
  const load = () => server.load({ meetings: [...served, ...refused], recordedVotes: recorded });
  return {
    serve(meetings: readonly Meeting[]): void {
      served = meetings;
      load();
    },
    forbid(meeting: Meeting): void {
      refused = [...refused, withoutTheUser(meeting)];
      load();
    },
    recordVote(vote: Vote): void {
      recorded = [...recorded, vote];
      load();
    },
  };
}

/** What the harness of `DocumentRepository` asks of the server: the documents it holds. */
export function documentsServerSide(server: TestServer) {
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
    serve(documents: readonly Document[]): void {
      served = documents;
      load();
    },
    forbid(document: Document): void {
      refused = [...refused, document];
      load();
    },
  };
}

/** What the harness of `VoteRepository` asks of the server: one meeting, and the votes recorded. */
export function votesServerSide(server: TestServer) {
  return {
    serve(meeting: Meeting): void {
      server.load({ meetings: [meeting], recordedVotes: [] });
    },
    change(meeting: Meeting): void {
      server.load({ meetings: [meeting], recordedVotes: server.backend.recordedVotes() });
    },
    recordedCount(vote: Vote): number {
      return server.backend
        .recordedVotes()
        .filter((held) => held.idempotencyKey === vote.idempotencyKey).length;
    },
  };
}
