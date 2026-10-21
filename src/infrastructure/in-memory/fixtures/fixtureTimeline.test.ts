import type { Meeting } from '@domain/entities/Meeting';
import { VOTING_STATE, getVotingState } from '@domain/policies/votingState';
import type { VotingState } from '@domain/policies/votingState';
import { MILLIS_PER_HOUR, unwrap } from '@domain/testing/builders';
import { parseInstant } from '@domain/value-objects/Instant';
import type { Instant } from '@domain/value-objects/Instant';

import { readFixtureFiles, referenceDateOnDisk } from '../../testing/fixtureFiles';

import { loadFixtures } from './loadFixtures';
import type { SeedData } from './loadFixtures';

// The fixtures are shifted by a whole number of days, so that the meetings keep their time of day.
// What the app relies on is that the shift never moves a meeting, or the end of a voting window,
// from one side of the clock to the other: whatever the instant the app starts at, the same 24
// meetings are ahead and the same 42 behind, and every resolution is in the same voting state as at
// the reference date. These tests load the files at instants spread over a day (the hour at which
// the shift changes, the hours around it, midnight UTC) and over the years, and compare.

const MILLIS_PER_MINUTE = 60_000;
const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR;
const REFERENCE = referenceDateOnDisk();
const UPCOMING_MEETING_COUNT = 24;
const PAST_MEETING_COUNT = 42;

/** Midnight UTC of an arbitrary day, the one whose hours are listed below. */
const A_MIDNIGHT = Date.UTC(2027, 2, 14);
/** Where the reference date falls in its day: the shift changes by a day at that time of day, every day. */
const SHIFT_TIME_OF_DAY = ((REFERENCE % MILLIS_PER_DAY) + MILLIS_PER_DAY) % MILLIS_PER_DAY;

const pad = (value: number): string => String(value).padStart(2, '0');

const EVERY_HOUR_OF_A_DAY = Array.from({ length: 24 }, (_, hour): [string, number] => [
  `${pad(hour)}:00 UTC`,
  A_MIDNIGHT + hour * MILLIS_PER_HOUR,
]);

const AROUND_MIDNIGHT: [string, number][] = [
  ['the minute before midnight UTC', A_MIDNIGHT - MILLIS_PER_MINUTE],
  ['the last millisecond before midnight UTC', A_MIDNIGHT - 1],
  ['midnight UTC', A_MIDNIGHT],
  ['the minute after midnight UTC', A_MIDNIGHT + MILLIS_PER_MINUTE],
];

const AROUND_THE_SHIFT: [string, number][] = [
  ['the minute before the shift changes', A_MIDNIGHT + SHIFT_TIME_OF_DAY - MILLIS_PER_MINUTE],
  ['the last millisecond before the shift changes', A_MIDNIGHT + SHIFT_TIME_OF_DAY - 1],
  ['the instant the shift changes', A_MIDNIGHT + SHIFT_TIME_OF_DAY],
  ['the minute after the shift changes', A_MIDNIGHT + SHIFT_TIME_OF_DAY + MILLIS_PER_MINUTE],
];

const ACROSS_THE_YEARS = [1990, 2000, 2024, 2026, 2027, 2028, 2031, 2050, 2100, 2200].flatMap(
  (year): [string, number][] => [
    [`the first instant of ${year}`, Date.UTC(year, 0, 1)],
    [`a day in the middle of ${year}`, Date.UTC(year, 5, 15, 12, 34, 56, 789)],
    [`the last millisecond of ${year}`, Date.UTC(year + 1, 0, 1) - 1],
  ],
);

const INSTANTS: [string, number][] = [
  ...EVERY_HOUR_OF_A_DAY,
  ...AROUND_MIDNIGHT,
  ...AROUND_THE_SHIFT,
  ...ACROSS_THE_YEARS,
];

const instant = (millis: number): Instant => unwrap(parseInstant(millis));

function loadedAt(millis: number): SeedData {
  const loaded = loadFixtures(readFixtureFiles(), instant(millis));
  if (!loaded.ok) throw new Error(loaded.error.detail);
  return loaded.value;
}

/** Which meetings are upcoming, and the voting state of each resolution, at `millis`. */
function timelineAt(millis: number) {
  const now = instant(millis);
  const { meetings, recordedVotes } = loadedAt(millis).content;
  const upcoming = (meeting: Meeting): boolean => meeting.scheduledAt > now;
  const states = new Map<string, VotingState>();
  for (const meeting of meetings) {
    for (const item of meeting.agenda) {
      if (item.resolution !== undefined) {
        states.set(item.resolution.id, getVotingState(item.resolution, now));
      }
    }
  }
  return {
    meetings,
    upcomingIds: meetings.filter(upcoming).map(({ id }) => id),
    pastIds: meetings.filter((meeting) => !upcoming(meeting)).map(({ id }) => id),
    states,
    latestCastAt: Math.max(...recordedVotes.map(({ castAt }) => castAt)),
  };
}

describe('the timeline of the fixtures', () => {
  const atReference = timelineAt(REFERENCE);
  const written = atReference.meetings;

  it('is, at the reference date, 24 meetings ahead and 42 behind, the ahead ones all open', () => {
    expect(atReference.upcomingIds).toHaveLength(UPCOMING_MEETING_COUNT);
    expect(atReference.pastIds).toHaveLength(PAST_MEETING_COUNT);
    const upcoming = new Set(atReference.upcomingIds);
    for (const meeting of atReference.meetings) {
      for (const item of meeting.agenda) {
        if (item.resolution === undefined) continue;
        if (upcoming.has(meeting.id)) {
          expect(atReference.states.get(item.resolution.id)).toBe(VOTING_STATE.Open);
        }
      }
    }
    expect(new Set(atReference.states.values())).toEqual(new Set(Object.values(VOTING_STATE)));
  });

  describe.each(INSTANTS)('at %s', (_name, millis) => {
    const timeline = timelineAt(millis);

    it('has the same meetings ahead and behind as at the reference date: 24 and 42', () => {
      expect(timeline.upcomingIds).toEqual(atReference.upcomingIds);
      expect(timeline.pastIds).toEqual(atReference.pastIds);
      expect(timeline.upcomingIds).toHaveLength(UPCOMING_MEETING_COUNT);
      expect(timeline.pastIds).toHaveLength(PAST_MEETING_COUNT);
    });

    it('has every resolution in the voting state it has at the reference date', () => {
      expect(timeline.states).toEqual(atReference.states);
    });

    it('has no vote cast in the future', () => {
      expect(timeline.latestCastAt).toBeLessThanOrEqual(millis);
    });

    it('keeps the hour of every meeting and of every closing time: a whole number of days apart', () => {
      const shifted = loadedAt(millis).content.meetings;
      for (const [index, meeting] of shifted.entries()) {
        const original = written[index];
        const days = (meeting.scheduledAt - (original?.scheduledAt ?? NaN)) / MILLIS_PER_DAY;
        expect(Number.isInteger(days)).toBe(true);
        expect(meeting.scheduledAt % MILLIS_PER_HOUR).toBe(0);
        for (const item of meeting.agenda) {
          if (item.resolution?.closesAt !== undefined) {
            expect(item.resolution.closesAt % MILLIS_PER_HOUR).toBe(0);
          }
        }
      }
    });
  });

  it('holds every quarter of an hour over three days around the reference date', () => {
    const QUARTER = 15 * MILLIS_PER_MINUTE;
    const first = REFERENCE - MILLIS_PER_DAY;
    const last = REFERENCE + 2 * MILLIS_PER_DAY;
    let checked = 0;

    for (let millis = first; millis <= last; millis += QUARTER) {
      const timeline = timelineAt(millis);
      expect(timeline.upcomingIds).toEqual(atReference.upcomingIds);
      expect(timeline.pastIds).toEqual(atReference.pastIds);
      expect(timeline.states).toEqual(atReference.states);
      checked += 1;
    }

    expect(checked).toBe(3 * 24 * 4 + 1);
  });
});
