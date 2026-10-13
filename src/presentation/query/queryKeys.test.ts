import { aMeetingId } from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';

import { queryKeys } from './queryKeys';

describe('queryKeys', () => {
  it('builds the key of a list from its period and its page size', () => {
    expect(queryKeys.meetings.list(MEETING_PERIOD.Upcoming, 10)).toEqual([
      'meetings',
      'list',
      'upcoming',
      10,
    ]);
  });

  it('gives a different key to each period and each page size', () => {
    const keys = [
      queryKeys.meetings.list(MEETING_PERIOD.Upcoming, 10),
      queryKeys.meetings.list(MEETING_PERIOD.Past, 10),
      queryKeys.meetings.list(MEETING_PERIOD.Upcoming, 20),
    ].map((key) => JSON.stringify(key));

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('builds the key of a meeting from its id', () => {
    expect(queryKeys.meetings.detail(aMeetingId('meeting-7'))).toEqual([
      'meetings',
      'detail',
      'meeting-7',
    ]);
    expect(queryKeys.meetings.detail(aMeetingId('a'))).not.toEqual(
      queryKeys.meetings.detail(aMeetingId('b')),
    );
  });

  it('starts every key of the meetings with the same scope, to reach them together', () => {
    expect(queryKeys.meetings.list(MEETING_PERIOD.Past, 5)[0]).toBe(
      queryKeys.meetings.detail(aMeetingId())[0],
    );
  });

  it('builds a new key at every call, so that a key can never be changed under another caller', () => {
    expect(queryKeys.meetings.detail(aMeetingId())).not.toBe(
      queryKeys.meetings.detail(aMeetingId()),
    );
  });
});
