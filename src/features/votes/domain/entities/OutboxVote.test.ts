import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { voteUndeliverable } from '@core/domain/errors/VoteDeliveryError';
import { VOTING_ERROR_CODE } from '@core/domain/errors/VotingError';
import { err } from '@core/domain/shared/Result';
import {
  MILLIS_PER_MINUTE,
  NOW,
  aPendingVote,
  aRejectedVote,
  aVote,
  at,
  unwrap,
} from '@testing/domain/builders';

import {
  OUTBOX_STATUS,
  createPendingVote,
  isPending,
  isRejected,
  recordAttempt,
  rejectVote,
  restorePendingVote,
} from './OutboxVote';

describe('createPendingVote', () => {
  it('starts pending, with no attempt', () => {
    expect(createPendingVote(aVote(), NOW)).toEqual({
      status: OUTBOX_STATUS.Pending,
      vote: aVote(),
      enqueuedAt: NOW,
      attempts: 0,
    });
  });
});

describe('recordAttempt', () => {
  it('counts one more attempt and leaves the original untouched', () => {
    const pending = createPendingVote(aVote(), NOW);

    const retried = recordAttempt(recordAttempt(pending));

    expect(retried.attempts).toBe(2);
    expect(pending.attempts).toBe(0);
    expect(retried.status).toBe(OUTBOX_STATUS.Pending);
    expect(retried.vote).toBe(pending.vote);
    expect(retried.enqueuedAt).toBe(NOW);
  });
});

describe('rejectVote', () => {
  const reason = { code: VOTING_ERROR_CODE.ResolutionClosed } as const;

  it('moves a pending vote to the rejected state, keeping its history and giving the reason', () => {
    const pending = recordAttempt(createPendingVote(aVote(), at(-1000)));

    expect(rejectVote(pending, reason, NOW)).toEqual({
      status: OUTBOX_STATUS.Rejected,
      vote: aVote(),
      enqueuedAt: at(-1000),
      attempts: 1,
      reason,
      rejectedAt: NOW,
    });
  });

  it('can carry the undeliverable reason', () => {
    const rejected = rejectVote(aPendingVote(), voteUndeliverable(5), NOW);

    expect(rejected.reason).toEqual(voteUndeliverable(5));
  });

  it('leaves the pending vote untouched', () => {
    const pending = aPendingVote();

    rejectVote(pending, reason, NOW);

    expect(pending.status).toBe(OUTBOX_STATUS.Pending);
    expect(pending).not.toHaveProperty('reason');
  });
});

describe('the states', () => {
  it('are told apart by their status', () => {
    expect(isPending(aPendingVote())).toBe(true);
    expect(isRejected(aPendingVote())).toBe(false);
    expect(isPending(aRejectedVote())).toBe(false);
    expect(isRejected(aRejectedVote())).toBe(true);
  });

  it('build a rejected vote that carries its reason and rejection instant', () => {
    const rejected = aRejectedVote();

    expect(rejected.rejectedAt).toBe(at(MILLIS_PER_MINUTE));
    expect(rejected.reason).toEqual({ code: VOTING_ERROR_CODE.ResolutionClosed });
  });
});

describe('restorePendingVote', () => {
  it('rebuilds a pending vote read back from storage', () => {
    expect(
      unwrap(restorePendingVote({ vote: aVote(), enqueuedAt: at(-1000), attempts: 3 })),
    ).toEqual({ status: OUTBOX_STATUS.Pending, vote: aVote(), enqueuedAt: at(-1000), attempts: 3 });
  });

  it.each([
    [-1, VALIDATION_RULE.OutOfRange],
    [1_000_001, VALIDATION_RULE.OutOfRange],
    [1.5, VALIDATION_RULE.NotAnInteger],
  ])('rejects the attempt count %p', (attempts, rule) => {
    expect(restorePendingVote({ vote: aVote(), enqueuedAt: NOW, attempts })).toEqual(
      err(validationError(VALIDATION_FIELD.AttemptCount, rule)),
    );
  });
});
