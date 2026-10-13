import { VALIDATION_FIELD } from '@domain/errors/ValidationError';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import { aVote, at } from '@domain/testing/builders';

import { toVote, toVoteRequestWire, voteRequestSchema } from './voteDto';

const WIRE = toVoteRequestWire(aVote());

describe('the vote request', () => {
  it('writes the vote without its key: the key is derived from the resolution and the voter', () => {
    expect(WIRE).toEqual({
      resolutionId: 'resolution-1',
      meetingId: 'meeting-1',
      voterId: 'user-1',
      choice: 'for',
      castAt: '2030-03-17T17:46:40.000Z',
    });
  });

  it.each([VOTE_CHOICE.For, VOTE_CHOICE.Against, VOTE_CHOICE.Abstain])(
    'gives the vote back as it was, for the choice %s',
    (choice) => {
      const vote = aVote({ choice, castAt: at(1234) });

      const parsed = voteRequestSchema.parse(JSON.parse(JSON.stringify(toVoteRequestWire(vote))));

      expect(toVote(parsed)).toStrictEqual({ ok: true, value: vote });
    },
  );

  it('ignores the fields it does not know, even an idempotency key it did not derive', () => {
    const parsed = voteRequestSchema.parse({ ...WIRE, idempotencyKey: 'forged', extra: 1 });

    expect(parsed).not.toHaveProperty('idempotencyKey');
    expect(toVote(parsed)).toMatchObject({
      ok: true,
      value: { idempotencyKey: '12.resolution-1.user-1' },
    });
  });

  it.each(Object.keys(WIRE))('fails when %s is missing', (field) => {
    const { [field as keyof typeof WIRE]: _removed, ...rest } = WIRE;

    expect(voteRequestSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ['resolutionId', 1],
    ['choice', true],
    ['castAt', 1_900_000_000_000],
    ['castAt', 'now'],
  ])('fails when %s is %j', (field, value) => {
    expect(voteRequestSchema.safeParse({ ...WIRE, [field]: value }).success).toBe(false);
  });

  it.each([
    ['a choice nobody knows', { choice: 'maybe' }, VALIDATION_FIELD.VoteChoice],
    ['a blank resolution', { resolutionId: '' }, VALIDATION_FIELD.ResolutionId],
    ['a blank meeting', { meetingId: ' ' }, VALIDATION_FIELD.MeetingId],
    ['a blank voter', { voterId: '' }, VALIDATION_FIELD.UserId],
  ])('refuses %s through the factories of the domain', (_name, change, field) => {
    const mapped = toVote(voteRequestSchema.parse({ ...WIRE, ...change }));

    expect(!mapped.ok && mapped.error).toMatchObject({ field });
  });
});
