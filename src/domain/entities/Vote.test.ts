import { aMeetingId, aResolutionId, aUserId, NOW } from '../testing/builders';
import { VOTE_CHOICE } from '../value-objects/VoteChoice';

import { createVote, idempotencyKeyOf } from './Vote';

describe('idempotencyKeyOf', () => {
  it('is deterministic: the same resolution and voter give the same key', () => {
    expect(idempotencyKeyOf(aResolutionId('r1'), aUserId('u1'))).toBe(
      idempotencyKeyOf(aResolutionId('r1'), aUserId('u1')),
    );
  });

  it('differs when the resolution or the voter differs', () => {
    const key = idempotencyKeyOf(aResolutionId('r1'), aUserId('u1'));

    expect(idempotencyKeyOf(aResolutionId('r2'), aUserId('u1'))).not.toBe(key);
    expect(idempotencyKeyOf(aResolutionId('r1'), aUserId('u2'))).not.toBe(key);
  });

  it('does not depend on the choice: a member votes once per resolution', () => {
    const vote = (choice: typeof VOTE_CHOICE.For | typeof VOTE_CHOICE.Against) =>
      createVote({
        resolutionId: aResolutionId(),
        meetingId: aMeetingId(),
        voterId: aUserId(),
        choice,
        castAt: NOW,
      });

    expect(vote(VOTE_CHOICE.For).idempotencyKey).toBe(vote(VOTE_CHOICE.Against).idempotencyKey);
  });

  it('cannot be confused by ids that contain the separator', () => {
    expect(idempotencyKeyOf(aResolutionId('a.b'), aUserId('c'))).not.toBe(
      idempotencyKeyOf(aResolutionId('a'), aUserId('b.c')),
    );
    expect(idempotencyKeyOf(aResolutionId('1.a'), aUserId('b'))).not.toBe(
      idempotencyKeyOf(aResolutionId('1'), aUserId('a.b')),
    );
  });

  it('never gives the same key to two different pairs of ids', () => {
    const alphabet = ['a', '.', '1', ':', '%'];
    const ids = alphabet.flatMap((first) => [
      first,
      ...alphabet.map((second) => `${first}${second}`),
      ...alphabet.flatMap((second) => alphabet.map((third) => `${first}${second}${third}`)),
    ]);
    const keys = ids.flatMap((resolution) =>
      ids.map((voter) => idempotencyKeyOf(aResolutionId(resolution), aUserId(voter))),
    );

    expect(new Set(keys).size).toBe(ids.length * ids.length);
  });

  it('is built from text only: ids with a lone surrogate or any other character give a key', () => {
    const lone = '\uD800';

    expect(() => idempotencyKeyOf(aResolutionId(lone), aUserId(lone))).not.toThrow();
    expect(() =>
      createVote({
        resolutionId: aResolutionId(`${lone}x`),
        meetingId: aMeetingId(),
        voterId: aUserId(`y${lone}`),
        choice: VOTE_CHOICE.For,
        castAt: NOW,
      }),
    ).not.toThrow();
    expect(idempotencyKeyOf(aResolutionId(lone), aUserId('u'))).not.toBe(
      idempotencyKeyOf(aResolutionId('\uD801'), aUserId('u')),
    );
  });
});

describe('createVote', () => {
  it('holds the fields it is given and the derived key', () => {
    const vote = createVote({
      resolutionId: aResolutionId(),
      meetingId: aMeetingId(),
      voterId: aUserId(),
      choice: VOTE_CHOICE.Abstain,
      castAt: NOW,
    });

    expect(vote).toEqual({
      resolutionId: aResolutionId(),
      meetingId: aMeetingId(),
      voterId: aUserId(),
      choice: VOTE_CHOICE.Abstain,
      castAt: NOW,
      idempotencyKey: idempotencyKeyOf(aResolutionId(), aUserId()),
    });
  });
});
