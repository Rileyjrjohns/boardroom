import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { MILLIS_PER_DAY, aMeetingId, aMeetingSummary, at } from '@domain/testing/builders';

import { MEETING_ROW_TEST_ID_PREFIX } from '../testIds';

// Test support, not production code: only tests import it (a lint rule enforces it).

/** A regular expression matching the row of every meeting. */
export const MEETING_ROW_TEST_ID_PATTERN = new RegExp(`^${MEETING_ROW_TEST_ID_PREFIX}`);

/** The meeting a row stands for: the test ID of the row without its prefix. */
export const meetingIdOfRowTestId = (testId: string): string =>
  testId.slice(MEETING_ROW_TEST_ID_PREFIX.length);

/**
 * `count` meetings of one period, one per day, named `<prefix>1`, `<prefix>2`, ... The first is
 * the nearest to the instant of the tests: upcoming ones go forward from it, past ones backward.
 */
export function meetingsOf(prefix: string, count: number, period: MeetingPeriod): MeetingSummary[] {
  return Array.from({ length: count }, (_unused, index) => {
    const day = index + 1;
    return aMeetingSummary({
      id: aMeetingId(`${prefix}${day}`),
      title: `Meeting ${prefix}${day}`,
      location: `Room ${prefix}${day}`,
      scheduledAt: at((period === MEETING_PERIOD.Upcoming ? day : -day) * MILLIS_PER_DAY),
    });
  });
}
