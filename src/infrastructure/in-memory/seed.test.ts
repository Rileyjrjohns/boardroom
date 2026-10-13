import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { findParticipant } from '@domain/entities/Meeting';
import type { Meeting } from '@domain/entities/Meeting';
import { PARTICIPANT_ROLE, hasVotingRights } from '@domain/entities/Participant';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import type { Resolution } from '@domain/entities/Resolution';
import { NOW, aDuration } from '@domain/testing/builders';
import { parseInstant } from '@domain/value-objects/Instant';

import { DEMO_PASSWORD, PAST_MEETING_COUNT, UPCOMING_MEETING_COUNT, buildSeed } from './seed';
import type { SeedData } from './seed';

function seedAt(now = NOW): SeedData {
  const seed = buildSeed(now);
  if (!seed.ok) throw new Error(`The seed is invalid: ${seed.error.detail}`);
  return seed.value;
}

const resolutionsOf = (meeting: Meeting): Resolution[] =>
  meeting.agenda.flatMap((item) => (item.resolution === undefined ? [] : [item.resolution]));

describe('the seed of the simulated server', () => {
  const { content, accounts, demoUser } = seedAt();
  const upcoming = content.meetings.filter((meeting) => meeting.scheduledAt > NOW);
  const past = content.meetings.filter((meeting) => meeting.scheduledAt <= NOW);
  const alice = demoUser;
  const bruno = accounts[1]?.user;

  it('builds through the domain factories, at several instants, and always the same size', () => {
    for (const now of [NOW, NOW + 1, NOW + 183 * 24 * 3_600_000, 4_000_000_000_000]) {
      const seed = seedAt(parseNow(now));

      expect(seed.content.meetings).toHaveLength(UPCOMING_MEETING_COUNT + PAST_MEETING_COUNT);
    }
  });

  it('is invalid, and says so, when the instant leaves no room for the past meetings', () => {
    const seed = buildSeed(aEarlyInstant());

    expect(seed.ok).toBe(false);
    if (!seed.ok) expect(seed.error.detail).toEqual(expect.any(String));
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
