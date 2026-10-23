import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { aMeetingId } from '@testing/domain/builders';

import { meetingsQueryKeys } from './meetingsQueryKeys';

describe('queryKeys', () => {
  it('builds the key of a list from its period and its page size', () => {
    expect(meetingsQueryKeys.list(MEETING_PERIOD.Upcoming, 10)).toEqual([
      'meetings',
      'list',
      'upcoming',
      10,
    ]);
  });

  it('gives a different key to each period and each page size', () => {
    const keys = [
      meetingsQueryKeys.list(MEETING_PERIOD.Upcoming, 10),
      meetingsQueryKeys.list(MEETING_PERIOD.Past, 10),
      meetingsQueryKeys.list(MEETING_PERIOD.Upcoming, 20),
    ].map((key) => JSON.stringify(key));

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('builds the key of a meeting from its id', () => {
    expect(meetingsQueryKeys.detail(aMeetingId('meeting-7'))).toEqual([
      'meetings',
      'detail',
      'meeting-7',
    ]);
    expect(meetingsQueryKeys.detail(aMeetingId('a'))).not.toEqual(
      meetingsQueryKeys.detail(aMeetingId('b')),
    );
  });

  it('starts every key of the meetings with the same scope, to reach them together', () => {
    expect(meetingsQueryKeys.list(MEETING_PERIOD.Past, 5)[0]).toBe(
      meetingsQueryKeys.detail(aMeetingId())[0],
    );
  });

  it('builds the key of the meetings held, as the prefix of the key of each one', () => {
    const prefix = meetingsQueryKeys.details();
    const detail = meetingsQueryKeys.detail(aMeetingId('meeting-7'));

    expect(prefix).toEqual(['meetings', 'detail']);
    expect(detail.slice(0, prefix.length)).toEqual([...prefix]);
    expect(meetingsQueryKeys.list(MEETING_PERIOD.Past, 5).slice(0, prefix.length)).not.toEqual([
      ...prefix,
    ]);
  });

  it('builds a new key at every call, so that a key can never be changed under another caller', () => {
    expect(meetingsQueryKeys.detail(aMeetingId())).not.toBe(meetingsQueryKeys.detail(aMeetingId()));
  });
});
