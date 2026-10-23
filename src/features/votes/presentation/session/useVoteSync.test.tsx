import { act, waitFor } from '@testing-library/react-native';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { epochOf } from '@composition/shell/testing/accessEpoch';
import { networkUnavailable, unauthorized, unexpected } from '@core/domain/errors/RepositoryError';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import { err } from '@core/domain/shared/Result';
import { meetingsQueryKeys } from '@features/meetings/presentation/query/meetingsQueryKeys';
import { votesQueryKeys } from '@features/votes/presentation/query/votesQueryKeys';
import { createFakes } from '@testing/application/createFakes';
import {
  aPendingVote,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
} from '@testing/domain/builders';
import { renderScreenHook } from '@testing/presentation/renderScreen';
import type { RenderScreenOptions } from '@testing/presentation/renderScreen';

import { useVoteSync } from './useVoteSync';

// The one place that decides when the votes that wait are sent. The use case does the sending;
// these tests are about the conditions under which the interface asks, what it tells the user, and
// what it refreshes afterwards.

const R1 = aResolutionId('r1');
const R2 = aResolutionId('r2');

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderSync(options: RenderScreenOptions = {}) {
  const fakes = options.fakes ?? createFakes();
  const rendered = renderScreenHook(() => useVoteSync(), {
    access: ACCESS.Unlocked,
    ...options,
    fakes,
  });
  return { ...rendered, requestSync: () => rendered.result.current() };
}

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function sync(rendered: ReturnType<typeof renderSync>): Promise<void> {
  await act(async () => {
    rendered.requestSync();
  });
  await settle();
}

/** Holds the answer of the server to the first vote until the test lets it go. */
function holdServer(fakes: ReturnType<typeof createFakes>) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = fakes.votes.submit.bind(fakes.votes);
  let running = 0;
  let overlapped = false;
  fakes.votes.submit = async (vote) => {
    running += 1;
    overlapped ||= running > 1;
    await gate;
    const answer = await original(vote);
    running -= 1;
    return answer;
  };
  return { release: () => release(), overlapped: () => overlapped };
}

describe('useVoteSync', () => {
  describe('what it sends', () => {
    it('sends the votes that wait, oldest first, and records them with the server', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(
        aPendingVote(aVote({ resolutionId: R1 })),
        aPendingVote(aVote({ resolutionId: R2 })),
      );
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(fakes.votes.received.map((vote) => vote.resolutionId)).toEqual([R1, R2]);
      expect(fakes.outbox.snapshot()).toEqual([]);
    });

    it('tells how many were sent, in the banner, when something was', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(
        aPendingVote(aVote({ resolutionId: R1 })),
        aPendingVote(aVote({ resolutionId: R2 })),
      );
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.voteSyncStore.getState().syncSummary).toEqual({ synced: 2, rejected: 0 });
    });

    it('tells how many were rejected when the server refused some', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(
        aPendingVote(aVote({ resolutionId: R1 })),
        aPendingVote(aVote({ resolutionId: R2 })),
      );
      fakes.votes.answerNext(err({ code: VOTING_ERROR_CODE.NoVotingRights }));
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.voteSyncStore.getState().syncSummary).toEqual({ synced: 1, rejected: 1 });
    });

    it('says nothing when nothing waited, nothing was sent and nothing was rejected', async () => {
      const rendered = renderSync();

      await sync(rendered);

      expect(rendered.voteSyncStore.getState().syncSummary).toBeUndefined();
    });

    it('says nothing when the network is down: the votes stay, and no attempt is counted', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      fakes.network.goOffline();
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.voteSyncStore.getState().syncSummary).toBeUndefined();
      expect(fakes.outbox.snapshot()).toHaveLength(1);
      expect(fakes.outbox.snapshot()[0]).toMatchObject({ attempts: 0 });
      expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    });

    it('says nothing when the server fails in a way that says nothing about the vote', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      fakes.votes.answerNext(err(unexpected()));
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.voteSyncStore.getState().syncSummary).toBeUndefined();
      expect(fakes.outbox.snapshot()).toHaveLength(1);
    });
  });

  describe('what it refreshes afterwards', () => {
    it('asks again for the outbox and for the meetings, when something was sent', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      const rendered = renderSync({ fakes });
      rendered.queryClient.setQueryData(votesQueryKeys.pending(), { pending: [1], rejected: [] });
      rendered.queryClient.setQueryData(meetingsQueryKeys.detail(aVote().meetingId), 'a meeting');

      await sync(rendered);

      expect(rendered.queryClient.getQueryState(votesQueryKeys.pending())?.isInvalidated).toBe(
        true,
      );
      expect(
        rendered.queryClient.getQueryState(meetingsQueryKeys.detail(aVote().meetingId))
          ?.isInvalidated,
      ).toBe(true);
    });

    it('leaves the queries alone when nothing changed', async () => {
      const rendered = renderSync();
      rendered.queryClient.setQueryData(votesQueryKeys.pending(), { pending: [], rejected: [] });

      await sync(rendered);

      expect(rendered.queryClient.getQueryState(votesQueryKeys.pending())?.isInvalidated).toBe(
        false,
      );
    });
  });

  describe('when it does not send', () => {
    it.each([ACCESS.Locked, ACCESS.SignedOut, ACCESS.Starting])(
      'does not ask the use case at all while the state is %s',
      async (access) => {
        const fakes = createFakes();
        fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
        const rendered = renderSync({ fakes, access });

        await sync(rendered);

        expect(fakes.votes.received).toEqual([]);
        expect(fakes.outbox.snapshot()).toHaveLength(1);
      },
    );

    it('sends once the app is open again, when it is asked again', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      const rendered = renderSync({ fakes, access: ACCESS.Locked });
      await sync(rendered);
      expect(fakes.votes.received).toEqual([]);

      act(() => {
        rendered.accessStore.getState().unlocked();
      });
      await sync(rendered);

      expect(fakes.votes.received).toHaveLength(1);
    });
  });

  describe('never two runs at once', () => {
    it('answers a request that comes during a run with one more run after it, not a concurrent one', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      const server = holdServer(fakes);
      const useCase = jest.spyOn(fakes.votes, 'submit');
      const rendered = renderSync({ fakes });

      await act(async () => {
        rendered.requestSync();
        rendered.requestSync();
        rendered.requestSync();
      });
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R2 })));
      await act(async () => {
        server.release();
        await jest.advanceTimersByTimeAsync(0);
      });
      await settle();

      expect(server.overlapped()).toBe(false);
      expect(fakes.votes.recordedVotes().map((vote) => vote.resolutionId)).toEqual([R1, R2]);
      expect(useCase).toHaveBeenCalledTimes(2);
    });

    it('asks again later: the guard is released when a run ends', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      const rendered = renderSync({ fakes });
      await sync(rendered);

      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R2 })));
      await sync(rendered);

      expect(fakes.votes.received.map((vote) => vote.resolutionId)).toEqual([R1, R2]);
    });

    it('does not run again after the user left the open app during a run', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      const server = holdServer(fakes);
      const rendered = renderSync({ fakes });
      const run = jest.spyOn(rendered.services.useCases.syncPendingVotes, 'execute');
      await act(async () => {
        rendered.requestSync();
        rendered.requestSync();
      });

      act(() => {
        rendered.accessStore.getState().locked(epochOf(rendered.accessStore));
      });
      await act(async () => {
        server.release();
        await jest.advanceTimersByTimeAsync(0);
      });
      await settle();

      expect(fakes.votes.received).toHaveLength(1);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the run meets the end of the session', () => {
    it('ends it for the whole app when the server refuses the session', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      fakes.votes.answerNext(err(unauthorized()));
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.accessStore.getState().access).toBe(ACCESS.SignedOut);
      expect(rendered.accessStore.getState().sessionEndedBy).toBe('unauthorized');
      expect(rendered.voteSyncStore.getState().syncSummary).toBeUndefined();
    });

    it('sends the user to the lock screen when the app is locked under it', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      fakes.appLock.lock();
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.accessStore.getState().access).toBe(ACCESS.Locked);
      expect(fakes.votes.received).toEqual([]);
    });

    it('sends the user to the sign-in screen when somebody else signs in during the run, and the server refuses the vote of the first', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(
        aPendingVote(aVote({ resolutionId: R1 })),
        aPendingVote(aVote({ resolutionId: R2 })),
      );
      fakes.votes.onReceive = () => {
        fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
      };
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.accessStore.getState().access).toBe(ACCESS.SignedOut);
      expect(rendered.accessStore.getState().sessionEndedBy).toBe('unauthorized');
      expect(rendered.voteSyncStore.getState().syncSummary).toBeUndefined();
    });

    it('sends the user to the sign-in screen when nobody is signed in', async () => {
      const fakes = createFakes();
      fakes.auth.session = undefined;
      const rendered = renderSync({ fakes });

      await sync(rendered);

      await waitFor(() => {
        expect(rendered.accessStore.getState().sessionEndedBy).toBe('notAuthenticated');
      });
    });

    it('does not end the session for a connection that is down', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      fakes.votes.answerNext(err(networkUnavailable()));
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    });

    it('does not end the session for an outbox that cannot be read: a fault of the device is not the end of it', async () => {
      const fakes = createFakes();
      fakes.outbox.listFailure = storageReadFailed();
      const rendered = renderSync({ fakes });

      await sync(rendered);

      expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    });
  });

  describe('the summary the runs leave', () => {
    it('adds up what the runs sent, until the user dismisses it', async () => {
      const fakes = createFakes();
      const rendered = renderSync({ fakes });
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      await sync(rendered);
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R2 })));
      fakes.votes.answerNext(err({ code: VOTING_ERROR_CODE.NoVotingRights }));

      await sync(rendered);

      expect(rendered.voteSyncStore.getState().syncSummary).toEqual({ synced: 1, rejected: 1 });

      act(() => {
        rendered.voteSyncStore.getState().dismissSyncSummary();
      });
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: aResolutionId('r3') })));
      await sync(rendered);

      expect(rendered.voteSyncStore.getState().syncSummary).toEqual({ synced: 1, rejected: 0 });
    });
  });

  describe('a run that outlives the user who started it', () => {
    /** The user of the run leaves, and somebody else signs in, while the server is answering. */
    function swapUsers(rendered: ReturnType<typeof renderSync>): void {
      act(() => {
        rendered.accessStore.getState().signedOut();
        rendered.accessStore.getState().signedIn();
      });
    }

    it('does not show what it sent to the user who signed in after', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      const server = holdServer(fakes);
      const rendered = renderSync({ fakes });
      await act(async () => {
        rendered.requestSync();
      });

      swapUsers(rendered);
      await act(async () => {
        server.release();
        await jest.advanceTimersByTimeAsync(0);
      });
      await settle();

      expect(fakes.votes.received).toHaveLength(1);
      expect(rendered.voteSyncStore.getState().syncSummary).toBeUndefined();
      expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    });

    it.each([
      [
        'unauthorized',
        (fakes: ReturnType<typeof createFakes>) => fakes.votes.answerNext(err(unauthorized())),
      ],
      [
        'notAuthenticated',
        (fakes: ReturnType<typeof createFakes>) => {
          fakes.votes.onReceive = () => {
            fakes.auth.session = undefined;
          };
        },
      ],
    ] as const)(
      'does not sign the user who signed in after out when it meets %s',
      async (_code, script) => {
        const fakes = createFakes();
        fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
        script(fakes);
        const server = holdServer(fakes);
        const rendered = renderSync({ fakes });
        await act(async () => {
          rendered.requestSync();
        });

        swapUsers(rendered);
        await act(async () => {
          server.release();
          await jest.advanceTimersByTimeAsync(0);
        });
        await settle();

        expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
        expect(rendered.accessStore.getState().sessionEndedBy).toBeUndefined();
      },
    );

    it('is followed by a run of its own for the user who signed in after, when they asked for one', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
      const server = holdServer(fakes);
      const rendered = renderSync({ fakes });
      const run = jest.spyOn(rendered.services.useCases.syncPendingVotes, 'execute');
      await act(async () => {
        rendered.requestSync();
      });

      swapUsers(rendered);
      rendered.requestSync();
      await act(async () => {
        server.release();
        await jest.advanceTimersByTimeAsync(0);
      });
      await settle();

      expect(run).toHaveBeenCalledTimes(2);
    });
  });
});
