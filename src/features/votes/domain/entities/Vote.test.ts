import type { ResolutionId, UserId } from '@core/domain/value-objects/ids';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { aMeetingId, aResolutionId, aUserId, NOW } from '@testing/domain/builders';

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
    const everyId = alphabet.flatMap((first) => [
      first,
      ...alphabet.map((second) => `${first}${second}`),
      ...alphabet.flatMap((second) => alphabet.map((third) => `${first}${second}${third}`)),
    ]);
    // "." and ".." are not identifiers (they are directories in a path).
    const ids = everyId.filter((id) => id !== '.' && id !== '..');
    const keys = ids.flatMap((resolution) =>
      ids.map((voter) => idempotencyKeyOf(aResolutionId(resolution), aUserId(voter))),
    );

    expect(new Set(keys).size).toBe(ids.length * ids.length);
  });

  it('is built from text only: it gives a key for any text, even for ids the parsers refuse', () => {
    // The parsers refuse a lone surrogate, but the key is a pure function of two strings: whatever
    // reaches it is turned into a key, and never throws.
    const lone = '\uD800' as ResolutionId;
    const loneVoter = '\uD800' as UserId;

    expect(() => idempotencyKeyOf(lone, loneVoter)).not.toThrow();
    expect(idempotencyKeyOf(lone, aUserId('u'))).not.toBe(
      idempotencyKeyOf('\uD801' as ResolutionId, aUserId('u')),
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
