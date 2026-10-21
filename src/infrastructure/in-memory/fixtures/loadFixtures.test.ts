import { FakeClock } from '@application/testing/FakeClock';
import { findResolution } from '@domain/entities/Meeting';
import type { Meeting } from '@domain/entities/Meeting';
import { MILLIS_PER_HOUR, NOW, aDuration, aResolutionId, unwrap } from '@domain/testing/builders';
import { parseInstant } from '@domain/value-objects/Instant';
import type { Instant } from '@domain/value-objects/Instant';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { createPageRequest } from '@domain/value-objects/PageRequest';

import {
  fixtureFileNamesOnDisk,
  readFixtureFile,
  readFixtureFiles,
  referenceDateOnDisk,
} from '../../testing/fixtureFiles';
import { InMemoryAuthSession } from '../InMemoryAuthSession';
import { InMemoryBackend } from '../InMemoryBackend';
import { SimulatedNetwork } from '../SimulatedNetwork';
import { DEMO_PASSWORD, buildSeed } from '../seed';

import { BUNDLED_FIXTURES } from './bundledFixtures';
import { accountsFileSchema, meetingsFileSchema, recordedVotesFileSchema } from './fixtureSchemas';
import { FIXTURE_ERROR_CODE, FIXTURE_FILE, loadFixtures } from './loadFixtures';
import type { FixtureError, FixtureFiles } from './loadFixtures';

const instant = (millis: number): Instant => unwrap(parseInstant(millis));

const REFERENCE = referenceDateOnDisk();
const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR;

/** The instants the app may start at, before and after the reference date of the files. */
const NOWS = [
  ['the reference date', REFERENCE],
  ['a millisecond after the reference date', REFERENCE + 1],
  ['a millisecond before the reference date', REFERENCE - 1],
  ['a day before the reference date', REFERENCE - MILLIS_PER_DAY],
  ['a day less a millisecond after the reference date', REFERENCE + MILLIS_PER_DAY - 1],
  ['a day after the reference date', REFERENCE + MILLIS_PER_DAY],
  ['the instant of the tests', NOW],
  ['the year 2096', 4_000_000_000_000],
] as const;

/** The shift the files must get at `millis`: the complete days since the reference date, rounded down. */
const expectedShift = (millis: number): number =>
  Math.floor((millis - REFERENCE) / MILLIS_PER_DAY) * MILLIS_PER_DAY;

describe('the fixtures of docs/spec/fixtures', () => {
  const names = fixtureFileNamesOnDisk();

  it('are the three files the app reads, and no other JSON file', () => {
    expect(names).toEqual(Object.values(FIXTURE_FILE).sort());
  });

  describe.each([
    [FIXTURE_FILE.Accounts, accountsFileSchema],
    [FIXTURE_FILE.Meetings, meetingsFileSchema],
    [FIXTURE_FILE.RecordedVotes, recordedVotesFileSchema],
  ])('%s', (name, schema) => {
    const content = readFixtureFile(name);

    it('has the shape its schema describes', () => {
      expect(schema.safeParse(content).success).toBe(true);
    });

    it('declares its reference date first, as an ISO 8601 instant with a zone', () => {
      expect(Object.keys(content as object)[0]).toBe('referenceDate');
      expect((content as { referenceDate: string }).referenceDate).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
      );
    });

    it('is what the app bundles, as it is on disk', () => {
      const bundled = {
        [FIXTURE_FILE.Accounts]: BUNDLED_FIXTURES.accounts,
        [FIXTURE_FILE.Meetings]: BUNDLED_FIXTURES.meetings,
        [FIXTURE_FILE.RecordedVotes]: BUNDLED_FIXTURES.recordedVotes,
      }[name];

      expect(bundled).toEqual(content);
    });
  });

  it('share one reference date', () => {
    const dates = names.map(
      (name) => (readFixtureFile(name) as { referenceDate: string }).referenceDate,
    );

    expect(new Set(dates).size).toBe(1);
    expect(Number.isNaN(Date.parse(dates[0] ?? ''))).toBe(false);
  });

  it('keep their keys in alphabetical order, so that the files stay stable', () => {
    const sorted = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.every(sorted);
      if (typeof value !== 'object' || value === null) return true;
      const keys = Object.keys(value).filter((key) => key !== 'referenceDate');
      return (
        keys.join() === [...keys].sort().join() &&
        Object.values(value).every((member) => sorted(member))
      );
    };

    for (const name of names) expect(sorted(readFixtureFile(name))).toBe(true);
  });

  it('are the ones the app reads: the seed is made of them', () => {
    const seed = buildSeed(instant(NOW));
    const files = readFixtureFiles();

    expect(seed.ok).toBe(true);
    expect(loadFixtures(files, instant(NOW))).toEqual(seed);
  });

  it('give the demo accounts the password the app documents', () => {
    const seed = buildSeed(instant(NOW));

    expect(seed.ok && seed.value.accounts.map(({ password }) => password)).toEqual([
      DEMO_PASSWORD,
      DEMO_PASSWORD,
    ]);
  });

  describe('titles', () => {
    const { meetings } = meetingsFileSchema.parse(readFixtureFile(FIXTURE_FILE.Meetings));

    it('name no month and no year anywhere in the text, which the shift does not move', () => {
      const months =
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/;
      const years = /\b(?:19|20)\d{2}\b/;
      const texts = JSON.stringify(meetings).match(/"[^"]*"/g) ?? [];

      expect(texts.filter((text) => months.test(text) || years.test(text))).toEqual([]);
    });

    it('are a committee, a subject and a session number, which is distinct for every meeting', () => {
      const titles = meetings.map(({ title }) => title);

      expect(titles.every((title) => /^[^:]+: .+, session [1-9]\d*$/.test(title))).toBe(true);
      expect(new Set(titles).size).toBe(titles.length);
    });

    it('number the sessions of each committee from 1, oldest first, with no gap', () => {
      const byCommittee = new Map<string, number[]>();
      for (const { title } of [...meetings].sort(
        (first, second) => first.scheduledAt - second.scheduledAt,
      )) {
        const committee = title.split(':')[0] ?? '';
        const session = Number(/session (\d+)$/.exec(title)?.[1]);
        byCommittee.set(committee, [...(byCommittee.get(committee) ?? []), session]);
      }

      expect(byCommittee.size).toBeGreaterThan(1);
      for (const sessions of byCommittee.values()) {
        expect(sessions).toEqual(sessions.map((_, index) => index + 1));
      }
    });
  });

  it('keep the votes already recorded out of the meetings: the API gives a user their own', () => {
    const { meetings } = meetingsFileSchema.parse(readFixtureFile(FIXTURE_FILE.Meetings));

    const recorded = meetings.flatMap((meeting) =>
      meeting.agenda.filter((item) => item.resolution?.recordedVote !== undefined),
    );

    expect(recorded).toEqual([]);
  });
});

describe('loading the fixtures', () => {
  describe.each(NOWS)('at %s', (_name, millis) => {
    const now = instant(millis);
    const delta = expectedShift(millis);
    const raw = readFixtureFiles();
    const loaded = loadFixtures(raw, now);

    it('loads', () => {
      expect(loaded.ok).toBe(true);
    });

    it('moves every date of every file by the same whole number of days', () => {
      if (!loaded.ok) throw new Error(loaded.error.detail);
      const { meetings, recordedVotes } = meetingsAndVotes(raw);
      const { content } = loaded.value;

      expect(content.meetings).toHaveLength(meetings.length);
      for (const [index, wire] of meetings.entries()) {
        const meeting = content.meetings[index];
        expect(meeting?.id).toBe(wire.id);
        expect(meeting?.scheduledAt).toBe(Date.parse(wire.scheduledAt) + delta);
        for (const item of wire.agenda) {
          if (item.resolution === undefined) continue;
          const resolution = meeting && findResolution(meeting, aResolutionId(item.resolution.id));
          expect(resolution?.closesAt).toBe(
            item.resolution.closesAt === undefined
              ? undefined
              : Date.parse(item.resolution.closesAt) + delta,
          );
        }
      }
      expect(content.recordedVotes).toHaveLength(recordedVotes.length);
      for (const [index, wire] of recordedVotes.entries()) {
        expect(content.recordedVotes[index]?.castAt).toBe(Date.parse(wire.castAt) + delta);
      }
    });

    it('keeps the distance between any two dates of the files', () => {
      if (!loaded.ok) throw new Error(loaded.error.detail);
      const { meetings } = meetingsAndVotes(raw);
      const first = loaded.value.content.meetings[0];
      const last = loaded.value.content.meetings.at(-1);

      expect((first?.scheduledAt ?? 0) - (last?.scheduledAt ?? 0)).toBe(
        Date.parse(meetings[0]?.scheduledAt ?? '') - Date.parse(meetings.at(-1)?.scheduledAt ?? ''),
      );
    });

    it('keeps the time of day of every meeting, in UTC, on a round hour', () => {
      if (!loaded.ok) throw new Error(loaded.error.detail);
      const { meetings } = meetingsAndVotes(raw);

      for (const [index, wire] of meetings.entries()) {
        const written = new Date(wire.scheduledAt);
        const shifted = new Date(loaded.value.content.meetings[index]?.scheduledAt ?? NaN);
        expect(shifted.getUTCHours()).toBe(written.getUTCHours());
        expect(shifted.getUTCMinutes()).toBe(0);
        expect(shifted.getUTCSeconds() + shifted.getUTCMilliseconds()).toBe(0);
      }
    });

    it('does not change what it reads, and gives a new copy each time', () => {
      const before = JSON.stringify(raw);
      const again = loadFixtures(raw, now);

      expect(JSON.stringify(raw)).toBe(before);
      expect(again).toEqual(loaded);
      expect(again.ok && loaded.ok && again.value.content.meetings[0]).not.toBe(
        loaded.ok ? loaded.value.content.meetings[0] : undefined,
      );
    });
  });

  it('puts the same meetings upcoming as the files did, at the reference date itself', () => {
    const loaded = loadFixtures(readFixtureFiles(), instant(REFERENCE));
    if (!loaded.ok) throw new Error(loaded.error.detail);
    const { meetings } = meetingsAndVotes(readFixtureFiles());

    const upcoming = loaded.value.content.meetings.filter(
      ({ scheduledAt }) => scheduledAt > REFERENCE,
    );

    expect(upcoming.map(({ id }) => id)).toEqual(
      meetings.filter(({ scheduledAt }) => Date.parse(scheduledAt) > REFERENCE).map(({ id }) => id),
    );
  });

  it('reads dates written with an offset as the instants they stand for', () => {
    const files = readFixtureFiles();
    const { meetings } = meetingsFileOf(files);
    const first = meetings[0];
    if (first === undefined) throw new Error('no meeting');
    const written = new Date(Date.parse(first.scheduledAt) + 3_600_000).toISOString();
    first.scheduledAt = `${written.replace('Z', '')}+01:00`;

    const loaded = loadFixtures(files, instant(REFERENCE));

    expect(loaded.ok && loaded.value.content.meetings[0]?.scheduledAt).toBe(
      Date.parse(meetingsFileOf(readFixtureFiles()).meetings[0]?.scheduledAt ?? ''),
    );
  });

  describe('the shift', () => {
    const firstScheduledAt = (millis: number): number => {
      const loaded = loadFixtures(readFixtureFiles(), instant(millis));
      if (!loaded.ok) throw new Error(loaded.error.detail);
      return loaded.value.content.meetings[0]?.scheduledAt ?? NaN;
    };
    it.each([
      ['at the reference date', REFERENCE, 0],
      ['until the last millisecond of the first day', REFERENCE + MILLIS_PER_DAY - 1, 0],
      ['from a whole day after the reference date', REFERENCE + MILLIS_PER_DAY, 1],
      ['for the days that follow', REFERENCE + 400 * MILLIS_PER_DAY + 5 * MILLIS_PER_HOUR, 400],
      ['a millisecond before the reference date, rounded to the earlier day', REFERENCE - 1, -1],
      ['exactly a day before the reference date', REFERENCE - MILLIS_PER_DAY, -1],
      [
        'a millisecond more than a day before, rounded to the earlier day',
        REFERENCE - MILLIS_PER_DAY - 1,
        -2,
      ],
      ['for the days before', REFERENCE - 9 * MILLIS_PER_DAY - 3 * MILLIS_PER_HOUR, -10],
    ])('is a whole number of days %s: %d days', (_name, millis, days) => {
      const written = Date.parse(meetingsFileOf(readFixtureFiles()).meetings[0]?.scheduledAt ?? '');

      expect(firstScheduledAt(millis) - written).toBe(days * MILLIS_PER_DAY);
    });
  });

  it('chooses the demo user the file names, not the first account', () => {
    const files = readFixtureFiles();
    (files.accounts as { demoUserId: string }).demoUserId = 'user-bruno';

    const loaded = loadFixtures(files, instant(NOW));

    expect(loaded.ok && loaded.value.demoUser.fullName).toBe('Bruno Durand');
  });
});

describe('a broken fixture', () => {
  type Break = (files: FixtureFiles) => void;

  /** The error of loading the fixtures after `breakIt` damaged a copy of them. */
  function errorOf(breakIt: Break): FixtureError {
    const files = readFixtureFiles();
    breakIt(files);
    const loaded = loadFixtures(files, instant(NOW));
    if (loaded.ok) throw new Error('The broken fixtures were accepted.');
    return loaded.error;
  }

  const firstMeeting = (files: FixtureFiles) => {
    const meeting = meetingsFileOf(files).meetings[0];
    if (meeting === undefined) throw new Error('no meeting');
    return meeting;
  };
  const votesOf = (files: FixtureFiles) => (files.recordedVotes as VotesFile).recordedVotes;
  const accountsOf = (files: FixtureFiles) => (files.accounts as AccountsFile).accounts;

  describe.each<[string, Break, FixtureError['code'], FixtureError['file'], string]>([
    [
      'a date that is a number',
      (files) => {
        (firstMeeting(files) as { scheduledAt: unknown }).scheduledAt = 1_790_000_000_000;
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.Meetings,
      'meetings.0.scheduledAt',
    ],
    [
      'a date with no zone',
      (files) => {
        firstMeeting(files).scheduledAt = '2026-10-03T09:00:00';
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.Meetings,
      'meetings.0.scheduledAt',
    ],
    [
      'a missing title',
      (files) => {
        delete (firstMeeting(files) as { title?: string }).title;
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.Meetings,
      'meetings.0.title',
    ],
    [
      'a list that is not a list',
      (files) => {
        (files.meetings as { meetings: unknown }).meetings = 'none';
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.Meetings,
      'meetings',
    ],
    [
      'a missing reference date',
      (files) => {
        delete (files.accounts as { referenceDate?: string }).referenceDate;
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.Accounts,
      'referenceDate',
    ],
    [
      'a vote with a choice that is not text',
      (files) => {
        (votesOf(files)[3] as { choice: unknown }).choice = 1;
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.RecordedVotes,
      'recordedVotes.3.choice',
    ],
    [
      'an account with no password',
      (files) => {
        delete (accountsOf(files)[0] as { password?: string }).password;
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.Accounts,
      'accounts.0.password',
    ],
    [
      'a file that is not an object',
      (files) => {
        (files as { recordedVotes: unknown }).recordedVotes = null;
      },
      FIXTURE_ERROR_CODE.InvalidShape,
      FIXTURE_FILE.RecordedVotes,
      '$',
    ],
    [
      'a blank title',
      (files) => {
        firstMeeting(files).title = '   ';
      },
      FIXTURE_ERROR_CODE.InvalidValue,
      FIXTURE_FILE.Meetings,
      'meetings.0 (title required)',
    ],
    [
      'a status nobody knows',
      (files) => {
        const resolution = firstMeeting(files).agenda.find((item) => item.resolution)?.resolution;
        if (resolution === undefined) throw new Error('no resolution');
        resolution.status = 'archived';
      },
      FIXTURE_ERROR_CODE.InvalidValue,
      FIXTURE_FILE.Meetings,
      'meetings.0 (resolutionStatus unknownValue)',
    ],
    [
      'a vote that nobody can cast',
      (files) => {
        votesOf(files)[0] = {
          ...votesOf(files)[0],
          choice: 'maybe',
        } as VotesFile['recordedVotes'][0];
      },
      FIXTURE_ERROR_CODE.InvalidValue,
      FIXTURE_FILE.RecordedVotes,
      'recordedVotes.0 (voteChoice unknownValue)',
    ],
    [
      'an email that is not one',
      (files) => {
        (accountsOf(files)[1] as AccountsFile['accounts'][0]).user.email = 'not an email';
      },
      FIXTURE_ERROR_CODE.InvalidValue,
      FIXTURE_FILE.Accounts,
      'accounts.1 (email invalidFormat)',
    ],
    [
      'a reference date that differs between files',
      (files) => {
        (files.meetings as { referenceDate: string }).referenceDate = '2026-10-02T08:00:00.000Z';
      },
      FIXTURE_ERROR_CODE.ReferenceDateMismatch,
      FIXTURE_FILE.Meetings,
      'referenceDate',
    ],
    [
      'a vote on a resolution that does not exist',
      (files) => {
        (votesOf(files)[2] as { resolutionId: string }).resolutionId = 'resolution-nobody-wrote';
      },
      FIXTURE_ERROR_CODE.UnknownReference,
      FIXTURE_FILE.RecordedVotes,
      'recordedVotes.2.resolutionId',
    ],
    [
      'a vote that names another meeting than the one of its resolution',
      (files) => {
        (votesOf(files)[2] as { meetingId: string }).meetingId = 'meeting-066';
      },
      FIXTURE_ERROR_CODE.UnknownReference,
      FIXTURE_FILE.RecordedVotes,
      'recordedVotes.2.meetingId',
    ],
    [
      'a vote of someone who is not in the meeting',
      (files) => {
        (votesOf(files)[2] as { voterId: string }).voterId = 'user-nobody';
      },
      FIXTURE_ERROR_CODE.UnknownReference,
      FIXTURE_FILE.RecordedVotes,
      'recordedVotes.2.voterId',
    ],
    [
      'a demo user that is not an account',
      (files) => {
        (files.accounts as AccountsFile).demoUserId = 'user-nobody';
      },
      FIXTURE_ERROR_CODE.UnknownReference,
      FIXTURE_FILE.Accounts,
      'demoUserId',
    ],
    [
      'a meeting less than a day after the reference date',
      (files) => {
        firstMeeting(files).scheduledAt = new Date(REFERENCE + MILLIS_PER_DAY - 1).toISOString();
      },
      FIXTURE_ERROR_CODE.TimelineMargin,
      FIXTURE_FILE.Meetings,
      'meetings.0.scheduledAt',
    ],
    [
      'a meeting less than a day before the reference date',
      (files) => {
        firstMeeting(files).scheduledAt = new Date(REFERENCE - MILLIS_PER_DAY + 1).toISOString();
      },
      FIXTURE_ERROR_CODE.TimelineMargin,
      FIXTURE_FILE.Meetings,
      'meetings.0.scheduledAt',
    ],
    [
      'a closing time less than a day after the reference date',
      (files) => {
        const resolution = firstMeeting(files).agenda[1]?.resolution;
        if (resolution === undefined) throw new Error('no resolution');
        resolution.closesAt = new Date(REFERENCE + MILLIS_PER_HOUR).toISOString();
      },
      FIXTURE_ERROR_CODE.TimelineMargin,
      FIXTURE_FILE.Meetings,
      'meetings.0.agenda.1.resolution.closesAt',
    ],
    [
      'a closing time less than a day before the reference date',
      (files) => {
        const resolution = firstMeeting(files).agenda[1]?.resolution;
        if (resolution === undefined) throw new Error('no resolution');
        resolution.closesAt = new Date(REFERENCE - MILLIS_PER_HOUR).toISOString();
      },
      FIXTURE_ERROR_CODE.TimelineMargin,
      FIXTURE_FILE.Meetings,
      'meetings.0.agenda.1.resolution.closesAt',
    ],
    [
      'a vote cast after the reference date',
      (files) => {
        (votesOf(files)[4] as { castAt: string }).castAt = new Date(REFERENCE + 1).toISOString();
      },
      FIXTURE_ERROR_CODE.TimelineMargin,
      FIXTURE_FILE.RecordedVotes,
      'recordedVotes.4.castAt',
    ],
    [
      'two meetings with the same id',
      (files) => {
        const { meetings } = meetingsFileOf(files);
        const second = meetings[1];
        if (second === undefined) throw new Error('no second meeting');
        second.id = firstMeeting(files).id;
      },
      FIXTURE_ERROR_CODE.Duplicate,
      FIXTURE_FILE.Meetings,
      'meetings.1.id',
    ],
    [
      'a document listed by two meetings',
      (files) => {
        const { meetings } = meetingsFileOf(files);
        const document = firstMeeting(files).documents[0];
        const second = meetings[1];
        if (document === undefined || second === undefined) throw new Error('nothing to share');
        second.documents[0] = document;
      },
      FIXTURE_ERROR_CODE.Duplicate,
      FIXTURE_FILE.Meetings,
      'meetings.1.documents',
    ],
    [
      'the same vote twice',
      (files) => {
        votesOf(files).push({ ...votesOf(files)[0] } as VotesFile['recordedVotes'][0]);
      },
      FIXTURE_ERROR_CODE.Duplicate,
      FIXTURE_FILE.RecordedVotes,
      `recordedVotes.${readCount()}`,
    ],
    [
      'two accounts with the same email',
      (files) => {
        const accounts = accountsOf(files);
        const [first, second] = accounts;
        if (first === undefined || second === undefined) throw new Error('no accounts');
        second.user.email = first.user.email;
      },
      FIXTURE_ERROR_CODE.Duplicate,
      FIXTURE_FILE.Accounts,
      'accounts.1',
    ],
  ])('with %s', (_name, breakIt, code, file, place) => {
    it('is reported as an error of the right kind, in the right file and place', () => {
      const error = errorOf(breakIt);

      expect(error.code).toBe(code);
      expect(error.file).toBe(file);
      expect(error.detail).toBe(`${file}: ${place}`);
    });

    it('is not thrown, and says nothing of the values of the files', () => {
      const files = readFixtureFiles();
      breakIt(files);

      const loaded = loadFixtures(files, instant(NOW));

      expect(loaded.ok).toBe(false);
      if (!loaded.ok) {
        expect(loaded.error.detail).not.toContain(DEMO_PASSWORD);
        expect(loaded.error.detail).not.toContain('@boardroom.example');
      }
    });
  });

  it('is reported as an error when the instant leaves no room for the past meetings', () => {
    const loaded = loadFixtures(readFixtureFiles(), instant(aDuration(1000)));

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe(FIXTURE_ERROR_CODE.InvalidValue);
      expect(loaded.error.detail).toMatch(/^meetings\.json: meetings\.\d+ \(instant outOfRange\)$/);
    }
  });

  it('is reported as an error when a file is missing altogether', () => {
    const loaded = loadFixtures(
      { accounts: undefined, meetings: undefined, recordedVotes: undefined },
      instant(NOW),
    );

    expect(loaded).toEqual({
      ok: false,
      error: {
        code: FIXTURE_ERROR_CODE.InvalidShape,
        file: FIXTURE_FILE.Accounts,
        detail: 'accounts.json: $',
      },
    });
  });

  it.each([
    ['exactly a day after the reference date', REFERENCE + MILLIS_PER_DAY],
    ['exactly a day before the reference date', REFERENCE - MILLIS_PER_DAY],
  ])('accepts a meeting and a closing time %s: the margin is a whole day', (_name, millis) => {
    const files = readFixtureFiles();
    const meeting = meetingsFileOf(files).meetings[0];
    const resolution = meeting?.agenda[1]?.resolution;
    if (meeting === undefined || resolution === undefined) throw new Error('no meeting');
    meeting.scheduledAt = new Date(millis).toISOString();
    resolution.closesAt = new Date(millis).toISOString();
    const vote = (files.recordedVotes as VotesFile).recordedVotes[0];
    if (vote === undefined) throw new Error('no vote');
    vote.castAt = new Date(REFERENCE).toISOString();

    expect(loadFixtures(files, instant(NOW)).ok).toBe(true);
  });

  it('is found before the files are read, in the order accounts, meetings, votes', () => {
    const files = readFixtureFiles();
    (files.meetings as { meetings: unknown }).meetings = 1;
    (files.recordedVotes as { recordedVotes: unknown }).recordedVotes = 1;

    const loaded = loadFixtures(files, instant(NOW));

    expect(!loaded.ok && loaded.error.file).toBe(FIXTURE_FILE.Meetings);
  });
});

describe('the simulated server holding the fixtures', () => {
  it('serves to each demo user the meetings they take part in, soonest first, shifted to the clock', async () => {
    const now = instant(NOW);
    const seed = unwrap(buildSeed(now));
    const clock = new FakeClock(now);
    const network = new SimulatedNetwork({
      sleep: () => Promise.resolve(),
      latency: aDuration(0),
    });
    const auth = new InMemoryAuthSession({
      clock,
      network,
      accounts: seed.accounts,
      sessionLifetime: aDuration(MILLIS_PER_HOUR),
    });
    unwrap(auth.openSessionFor(seed.demoUser));
    const backend = unwrap(InMemoryBackend.create({ clock, auth, network, content: seed.content }));

    const upcoming = unwrap(
      await backend.listMeetings(MEETING_PERIOD.Upcoming, unwrap(createPageRequest({ limit: 50 }))),
    );
    const past = unwrap(
      await backend.listMeetings(MEETING_PERIOD.Past, unwrap(createPageRequest({ limit: 50 }))),
    );

    expect(upcoming.items).toHaveLength(24);
    expect(upcoming.items.map(({ scheduledAt }) => scheduledAt)).toEqual(
      upcoming.items.map(({ scheduledAt }) => scheduledAt).sort((a, b) => a - b),
    );
    expect(upcoming.items[0]?.id).toBe('meeting-001');
    expect(upcoming.items.every(({ scheduledAt }) => scheduledAt > now)).toBe(true);
    expect(past.items.every(({ scheduledAt }) => scheduledAt <= now)).toBe(true);
    expect(upcoming.items.length + past.items.length).toBeLessThanOrEqual(66);
    const meeting = unwrap(await backend.getMeeting(upcoming.items[0]?.id as Meeting['id']));
    expect(meeting.agenda.some((item) => item.resolution?.recordedVote !== undefined)).toBe(true);
  });
});

// The files as the tests read them, for the places where a test must reach into one.

interface MeetingsFile {
  referenceDate: string;
  meetings: {
    id: string;
    title: string;
    scheduledAt: string;
    agenda: {
      resolution?: { id: string; status: string; closesAt?: string };
    }[];
    documents: { id: string }[];
  }[];
}

interface VotesFile {
  recordedVotes: {
    resolutionId: string;
    meetingId: string;
    voterId: string;
    choice: string;
    castAt: string;
  }[];
}

interface AccountsFile {
  demoUserId: string;
  accounts: { password: string; user: { id: string; fullName: string; email: string } }[];
}

const meetingsFileOf = (files: FixtureFiles): MeetingsFile => files.meetings as MeetingsFile;

function meetingsAndVotes(files: FixtureFiles) {
  return {
    meetings: meetingsFileOf(files).meetings,
    recordedVotes: (files.recordedVotes as VotesFile).recordedVotes,
  };
}

/** How many votes the files record: the position the duplicate of a vote appended at the end takes. */
function readCount(): number {
  return (readFixtureFile(FIXTURE_FILE.RecordedVotes) as VotesFile).recordedVotes.length;
}
