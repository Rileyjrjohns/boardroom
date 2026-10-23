import { sessionQueryKeys } from '@features/auth/presentation/query/sessionQueryKeys';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { meetingsQueryKeys } from '@features/meetings/presentation/query/meetingsQueryKeys';
import { votesQueryKeys } from '@features/votes/presentation/query/votesQueryKeys';

// Each feature declares the keys of its own queries; they all live in one query client, so the
// composition is where it can be said that no two of them are the same.

describe('queryKeys', () => {
  it('builds the key of the outbox and the key of the signed-in user, apart from every other', () => {
    const keys = [
      votesQueryKeys.pending(),
      sessionQueryKeys.user(),
      meetingsQueryKeys.details(),
      meetingsQueryKeys.list(MEETING_PERIOD.Past, 5),
    ].map((key) => JSON.stringify(key));

    expect(new Set(keys).size).toBe(keys.length);
  });
});
