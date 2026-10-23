import { voteUndeliverable } from '@core/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@core/domain/errors/VotingError';
import type { VotingError } from '@core/domain/errors/VotingError';
import { aResolutionId } from '@testing/domain/builders';

import {
  rejectionReasonSchema,
  toRejectionReason,
  toRejectionReasonWire,
  toVotingError,
  toVotingErrorWire,
  votingErrorSchema,
} from './rejectionSchemas';

const VOTING_ERRORS: readonly VotingError[] = [
  { code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId('gone') },
  { code: VOTING_ERROR_CODE.NotAParticipant },
  { code: VOTING_ERROR_CODE.NoVotingRights },
  { code: VOTING_ERROR_CODE.ResolutionClosed },
  { code: VOTING_ERROR_CODE.VotingWindowOver },
  { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
  { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Queued },
];

describe('the schemas of a rejected vote', () => {
  it.each(VOTING_ERRORS)('give a voting error back as it was: %j', (error) => {
    const parsed = votingErrorSchema.parse(JSON.parse(JSON.stringify(toVotingErrorWire(error))));

    expect(toVotingError(parsed)).toStrictEqual({ ok: true, value: error });
  });

  it.each([...VOTING_ERRORS, voteUndeliverable(4)])(
    'give a rejection reason back as it was: %j',
    (reason) => {
      const parsed = rejectionReasonSchema.parse(
        JSON.parse(JSON.stringify(toRejectionReasonWire(reason))),
      );

      expect(toRejectionReason(parsed)).toStrictEqual({ ok: true, value: reason });
    },
  );

  it('keeps the voting errors apart from the giving up of a vote', () => {
    expect(votingErrorSchema.safeParse({ code: 'voteUndeliverable', attempts: 3 }).success).toBe(
      false,
    );
    expect(
      rejectionReasonSchema.safeParse({ code: 'voteUndeliverable', attempts: 3 }).success,
    ).toBe(true);
  });

  it.each([
    [{}],
    [{ code: 'somethingElse' }],
    [{ code: 'resolutionNotFound' }],
    [{ code: 'resolutionNotFound', resolutionId: 12 }],
    [{ code: 'alreadyVoted' }],
    [{ code: 'alreadyVoted', source: 'elsewhere' }],
    [{ code: 'voteUndeliverable', attempts: -1 }],
    [{ code: 'voteUndeliverable', attempts: 1.5 }],
    [{ code: 'voteUndeliverable' }],
    ['resolutionClosed'],
    [null],
  ])('refuse %j', (wire) => {
    expect(rejectionReasonSchema.safeParse(wire).success).toBe(false);
  });

  it('ignore the fields they do not know', () => {
    expect(votingErrorSchema.parse({ code: 'resolutionClosed', detail: 'ignored' })).toEqual({
      code: 'resolutionClosed',
    });
  });

  it('refuse a resolution id that is blank through the factory of the domain', () => {
    const parsed = votingErrorSchema.parse({ code: 'resolutionNotFound', resolutionId: ' ' });

    expect(toVotingError(parsed).ok).toBe(false);
    expect(toRejectionReason(parsed).ok).toBe(false);
  });
});
