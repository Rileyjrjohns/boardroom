import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { findParticipant } from '@domain/entities/Meeting';
import type { Meeting } from '@domain/entities/Meeting';
import { PARTICIPANT_ROLE, hasVotingRights } from '@domain/entities/Participant';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import type { Resolution } from '@domain/entities/Resolution';
import { VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { VOTING_STATE, getVotingState } from '@domain/policies/votingState';
import { checkVotingEligibility } from '@domain/policies/votingEligibility';
import { valuesOf } from '@domain/shared/constants';
import { NOW, aDuration } from '@domain/testing/builders';
import { parseInstant } from '@domain/value-objects/Instant';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { referenceDateOnDisk } from '../testing/fixtureFiles';

import { FIXTURE_ERROR_CODE, FIXTURE_FILE } from './fixtures/loadFixtures';
import { DEMO_PASSWORD, buildSeed } from './seed';
import type { SeedData } from './seed';

// The seed of the simulated server is the fixtures of docs/spec/fixtures, shifted to the clock. What
// matters to the app is what the shifted data looks like at any instant the app may start at: the
// invariants below hold at each of the instants listed, not only at the reference date of the files.

/** How many meetings of each period the fixtures hold: several pages of each at the page sizes of the app. */
const UPCOMING_MEETING_COUNT = 24;
const PAST_MEETING_COUNT = 42;

function seedAt(now = NOW): SeedData {
  const seed = buildSeed(now);
  if (!seed.ok) throw new Error(`The seed is invalid: ${seed.error.detail}`);
  return seed.value;
}

const MILLIS_PER_DAY = 24 * 3_600_000;
const REFERENCE = referenceDateOnDisk();

/** The instants the app may start at: the reference date of the files, around it, and far from it. */
const START_INSTANTS = [
  ['the instant of the tests', NOW],
  ['a millisecond later', NOW + 1],
  ['the reference date of the files', REFERENCE],
  ['a millisecond before the reference date', REFERENCE - 1],
  ['a month before the reference date', REFERENCE - 30 * MILLIS_PER_DAY],
  ['the start of a day', Math.floor(NOW / MILLIS_PER_DAY) * MILLIS_PER_DAY],
  ['the last millisecond of a day', Math.ceil(NOW / MILLIS_PER_DAY) * MILLIS_PER_DAY - 1],
  ['half a year later', NOW + 183 * MILLIS_PER_DAY],
  ['the year 2096', 4_000_000_000_000],
] as const;

const resolutionsOf = (meeting: Meeting): Resolution[] =>
  meeting.agenda.flatMap((item) => (item.resolution === undefined ? [] : [item.resolution]));

describe('the seed of the simulated server, read from the fixtures', () => {
  const { content, accounts, demoUser } = seedAt();
  const upcoming = content.meetings.filter((meeting) => meeting.scheduledAt > NOW);
  const past = content.meetings.filter((meeting) => meeting.scheduledAt <= NOW);
  const alice = demoUser;
  const bruno = accounts[1]?.user;

  it.each(START_INSTANTS)(
    'has the same upcoming and past meetings at %s, built through the domain factories',
    (_name, millis) => {
      const now = parseNow(millis);

      const { meetings } = seedAt(now).content;

      expect(meetings.filter((meeting) => meeting.scheduledAt > now)).toHaveLength(
        UPCOMING_MEETING_COUNT,
      );
      expect(meetings.filter((meeting) => meeting.scheduledAt <= now)).toHaveLength(
        PAST_MEETING_COUNT,
      );
    },
  );

  it('is invalid, and says so, when the instant leaves no room for the past meetings', () => {
    const seed = buildSeed(aEarlyInstant());

    expect(seed.ok).toBe(false);
    if (!seed.ok) {
      expect(seed.error).toEqual({
        code: FIXTURE_ERROR_CODE.InvalidValue,
        file: FIXTURE_FILE.Meetings,
        detail: expect.stringContaining('meetings.json: meetings.'),
      });
    }
  });

  it('is built from the clock alone: the same instant gives the same data', () => {
    expect(seedAt()).toEqual(seedAt());
  });

  it('has both upcoming and past meetings, enough for several pages of each', () => {
    expect(upcoming).toHaveLength(UPCOMING_MEETING_COUNT);
    expect(past).toHaveLength(PAST_MEETING_COUNT);
    expect(upcoming.length).toBeGreaterThan(2 * 10);
    expect(past.length).toBeGreaterThan(2 * 10);
  });

  it('follows the clock: moving it moves every meeting with it', () => {
    const later = seedAt(parseNow(NOW + 24 * 3_600_000));

    expect(later.content.meetings.filter((m) => m.scheduledAt > NOW + 24 * 3_600_000)).toHaveLength(
      UPCOMING_MEETING_COUNT,
    );
  });

  it('gives every meeting a distinct id, title, an agenda, documents and participants', () => {
    const ids = content.meetings.map((meeting) => meeting.id);
    const titles = content.meetings.map((meeting) => meeting.title);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
    for (const meeting of content.meetings) {
      expect(meeting.agenda.length).toBeGreaterThan(0);
      expect(meeting.documents.length).toBeGreaterThan(0);
      expect(meeting.participants.length).toBeGreaterThan(0);
      expect(meeting.location).not.toBe('');
    }
  });

  it('declares two demo accounts that share the demo password, the first one being the demo user', () => {
    expect(accounts).toHaveLength(2);
    expect(accounts.map(({ password }) => password)).toEqual([DEMO_PASSWORD, DEMO_PASSWORD]);
    expect(accounts[0]?.user).toEqual(alice);
    expect(alice.email).not.toBe(bruno?.email);
  });

  it('has the demo user as a voting member of most meetings, and as a non-voting guest in some', () => {
    const roles = content.meetings.map(
      (meeting) => findParticipant(meeting, alice.id)?.role ?? undefined,
    );
    const voting = content.meetings.filter((meeting) => {
      const seat = findParticipant(meeting, alice.id);
      return seat !== undefined && hasVotingRights(seat);
    });

    expect(voting.length).toBeGreaterThan(content.meetings.length / 2);
    expect(roles).toContain(PARTICIPANT_ROLE.Guest);
    expect(roles).toContain(PARTICIPANT_ROLE.Secretary);
    expect(roles).toContain(PARTICIPANT_ROLE.Chair);
    expect(roles).toContain(PARTICIPANT_ROLE.Member);
  });

  it('has the demo user in every meeting and the second demo user in some only', () => {
    expect(content.meetings.every((meeting) => findParticipant(meeting, alice.id))).toBe(true);
    const withBruno = content.meetings.filter(
      (meeting) => bruno !== undefined && findParticipant(meeting, bruno.id) !== undefined,
    );

    expect(withBruno.length).toBeGreaterThan(0);
    expect(withBruno.length).toBeLessThan(content.meetings.length);
  });

  it('has every kind of resolution: open, open without a closing time, closed with a closing time', () => {
    const resolutions = content.meetings.flatMap(resolutionsOf);

    expect(
      resolutions.some((r) => r.status === RESOLUTION_STATUS.Open && r.closesAt !== undefined),
    ).toBe(true);
    expect(
      resolutions.some((r) => r.status === RESOLUTION_STATUS.Open && r.closesAt === undefined),
    ).toBe(true);
    expect(
      resolutions.some((r) => r.status === RESOLUTION_STATUS.Closed && r.closesAt !== undefined),
    ).toBe(true);
  });

  it('keeps recorded votes out of the meetings: they belong to their voter', () => {
    expect(content.meetings.flatMap(resolutionsOf).every((r) => r.recordedVote === undefined)).toBe(
      true,
    );
  });

  it('has an open resolution of an upcoming meeting that the demo user already voted on', () => {
    const open = new Set(
      upcoming
        .flatMap(resolutionsOf)
        .filter((r) => r.status === RESOLUTION_STATUS.Open)
        .map((r) => r.id),
    );

    expect(
      content.recordedVotes.some(
        (vote) => vote.voterId === alice.id && open.has(vote.resolutionId),
      ),
    ).toBe(true);
  });

  it('records only votes on resolutions that exist, of voters who may vote there, once each', () => {
    const resolutions = new Map(
      content.meetings.flatMap((meeting) =>
        resolutionsOf(meeting).map((r) => [r.id, meeting] as const),
      ),
    );

    for (const vote of content.recordedVotes) {
      const meeting = resolutions.get(vote.resolutionId);
      const seat = meeting === undefined ? undefined : findParticipant(meeting, vote.voterId);
      expect(meeting?.id).toBe(vote.meetingId);
      expect(seat !== undefined && hasVotingRights(seat)).toBe(true);
    }
    const keys = content.recordedVotes.map((vote) => vote.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe.each(START_INSTANTS)('the resolutions at %s', (_name, millis) => {
    const now = parseNow(millis);
    const seed = seedAt(now);
    const meetings = seed.content.meetings;
    const isUpcoming = (meeting: Meeting): boolean => meeting.scheduledAt > now;
    const upcomingMeetings = meetings.filter(isUpcoming);
    const pastMeetings = meetings.filter((meeting) => !isUpcoming(meeting));
    const demoUser = seed.demoUser;
    const demoVotes = seed.content.recordedVotes.filter((vote) => vote.voterId === demoUser.id);

    it('are all open in an upcoming meeting, never closed, with a closing time after it starts or none', () => {
      for (const meeting of upcomingMeetings) {
        for (const resolution of resolutionsOf(meeting)) {
          expect(resolution.status).toBe(RESOLUTION_STATUS.Open);
          expect(getVotingState(resolution, now)).toBe(VOTING_STATE.Open);
          if (resolution.closesAt !== undefined) {
            expect(resolution.closesAt).toBeGreaterThan(meeting.scheduledAt);
          }
        }
      }
    });

    it('have a closing time after the meeting started, and already behind, in a past meeting', () => {
      for (const meeting of pastMeetings) {
        for (const resolution of resolutionsOf(meeting)) {
          expect(resolution.closesAt).toBeDefined();
          expect(resolution.closesAt ?? 0).toBeGreaterThan(meeting.scheduledAt);
          expect(resolution.closesAt ?? Infinity).toBeLessThanOrEqual(now);
          expect(getVotingState(resolution, now)).not.toBe(VOTING_STATE.Open);
        }
      }
    });

    it('close every close instant after its meeting starts, wherever it is', () => {
      for (const meeting of meetings) {
        for (const { closesAt } of resolutionsOf(meeting)) {
          if (closesAt !== undefined) expect(closesAt).toBeGreaterThan(meeting.scheduledAt);
        }
      }
    });

    it('show every state of the voting somewhere, and the window over only in the past', () => {
      const states = (list: readonly Meeting[]) =>
        new Set(list.flatMap(resolutionsOf).map((resolution) => getVotingState(resolution, now)));

      expect(states(meetings)).toEqual(new Set(valuesOf(VOTING_STATE)));
      expect(states(upcomingMeetings)).toEqual(new Set([VOTING_STATE.Open]));
      expect(states(pastMeetings)).toContain(VOTING_STATE.Closed);
      expect(states(pastMeetings)).toContain(VOTING_STATE.WindowOver);
    });

    it('include a past resolution that is still open by status once its window is over', () => {
      const lapsed = pastMeetings
        .flatMap(resolutionsOf)
        .filter((resolution) => resolution.status === RESOLUTION_STATUS.Open);

      expect(lapsed.length).toBeGreaterThan(0);
      expect(
        lapsed.every((resolution) => getVotingState(resolution, now) === VOTING_STATE.WindowOver),
      ).toBe(true);
    });

    it('include upcoming resolutions with a closing time and upcoming ones without', () => {
      const upcoming = upcomingMeetings.flatMap(resolutionsOf);

      expect(upcoming.some((resolution) => resolution.closesAt !== undefined)).toBe(true);
      expect(upcoming.some((resolution) => resolution.closesAt === undefined)).toBe(true);
    });

    it('have every choice among the votes of the demo user, on closed resolutions', () => {
      const closed = new Set(
        pastMeetings
          .flatMap(resolutionsOf)
          .filter((resolution) => getVotingState(resolution, now) === VOTING_STATE.Closed)
          .map((resolution) => resolution.id),
      );
      const choices = new Set(
        demoVotes.filter((vote) => closed.has(vote.resolutionId)).map((vote) => vote.choice),
      );

      expect(choices).toEqual(new Set(valuesOf(VOTE_CHOICE)));
    });

    it('have closed resolutions the demo user voted on and closed ones they did not, as a voting member', () => {
      const voted = new Set(demoVotes.map((vote) => vote.resolutionId));
      const closedAsVoter = pastMeetings
        .filter((meeting) => {
          const seat = findParticipant(meeting, demoUser.id);
          return seat !== undefined && hasVotingRights(seat);
        })
        .flatMap(resolutionsOf)
        .filter((resolution) => getVotingState(resolution, now) === VOTING_STATE.Closed);

      expect(closedAsVoter.some((resolution) => voted.has(resolution.id))).toBe(true);
      expect(closedAsVoter.some((resolution) => !voted.has(resolution.id))).toBe(true);
    });

    it('leave a few upcoming resolutions that the demo user can vote on right away', () => {
      const voted = new Set(demoVotes.map((vote) => vote.resolutionId));
      const votable = upcomingMeetings.filter((meeting) =>
        resolutionsOf(meeting).some(
          (resolution) =>
            !voted.has(resolution.id) &&
            checkVotingEligibility({
              meeting,
              resolutionId: resolution.id,
              voterId: demoUser.id,
              queuedVotes: [],
              now,
            }).ok,
        ),
      );

      expect(votable.length).toBeGreaterThanOrEqual(3);
    });

    it('have the demo user as a guest in a meeting, where there is nothing for them to vote on', () => {
      const asGuest = meetings.filter(
        (meeting) => findParticipant(meeting, demoUser.id)?.role === PARTICIPANT_ROLE.Guest,
      );

      expect(asGuest.length).toBeGreaterThan(0);
      for (const meeting of asGuest) {
        for (const resolution of resolutionsOf(meeting)) {
          const eligibility = checkVotingEligibility({
            meeting,
            resolutionId: resolution.id,
            voterId: demoUser.id,
            queuedVotes: [],
            now,
          });
          expect(!eligibility.ok && eligibility.error.code).toBe(VOTING_ERROR_CODE.NoVotingRights);
        }
      }
    });

    it('have no vote of the demo user on a resolution whose window lapsed', () => {
      const lapsed = new Set(
        pastMeetings
          .flatMap(resolutionsOf)
          .filter((resolution) => resolution.status === RESOLUTION_STATUS.Open)
          .map((resolution) => resolution.id),
      );

      expect(seed.content.recordedVotes.some((vote) => lapsed.has(vote.resolutionId))).toBe(false);
    });
  });

  it('has documents that are confidential and documents that are not', () => {
    const levels = new Set(
      content.meetings.flatMap((meeting) => meeting.documents.map((d) => d.confidentiality)),
    );

    expect(levels).toContain(CONFIDENTIALITY_LEVEL.Confidential);
    expect(levels).toContain(CONFIDENTIALITY_LEVEL.Internal);
    expect(levels).toContain(CONFIDENTIALITY_LEVEL.Public);
  });

  it('has distinct document ids across meetings, so that a document belongs to one meeting', () => {
    const ids = content.meetings.flatMap((meeting) => meeting.documents.map((d) => d.id));

    expect(new Set(ids).size).toBe(ids.length);
  });
});

function parseNow(millis: number) {
  const parsed = parseInstant(millis);
  if (!parsed.ok) throw new Error('invalid instant in the test');
  return parsed.value;
}

/** An instant so early that the past meetings would be dated before 1970. */
function aEarlyInstant() {
  return parseNow(aDuration(1000));
}
