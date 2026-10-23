import { buildSeed } from '@composition/dev/in-memory/seed';
import { VALIDATION_FIELD, VALIDATION_RULE } from '@core/domain/errors/ValidationError';
import { createPage } from '@core/domain/value-objects/Page';
import { parsePageCursor } from '@core/domain/value-objects/PageCursor';
import { RESOLUTION_STATUS } from '@features/meetings/domain/entities/Resolution';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import {
  NOW,
  aMeeting,
  aMeetingSummary,
  aMeetingWithAgenda,
  aResolution,
  anAgendaItem,
  at,
  unwrap,
} from '@testing/domain/builders';

import {
  meetingPageSchema,
  meetingSchema,
  meetingSummarySchema,
  toMeeting,
  toMeetingPage,
  toMeetingPageWire,
  toMeetingSummary,
  toMeetingSummaryWire,
  toMeetingWire,
} from './meetingDto';

/** A value through JSON, the way it travels. */
const overTheWire = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

const SUMMARY = toMeetingSummaryWire(aMeetingSummary());
const MEETING = toMeetingWire(aMeetingWithAgenda());

/** The wire of a meeting with `change` applied to a copy of it. */
function changed(change: (wire: Record<string, unknown>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(MEETING)) as Record<string, unknown>;
  change(copy);
  return copy;
}

describe('the meeting schemas', () => {
  describe('a summary', () => {
    it('reads the wire of a summary, and ignores the fields it does not know', () => {
      const parsed = meetingSummarySchema.parse({ ...SUMMARY, extra: 'ignored', nested: { a: 1 } });

      expect(parsed).toEqual({
        id: 'meeting-1',
        title: 'Board of directors',
        scheduledAt: NOW + 24 * 3_600_000,
        location: 'Room 1',
      });
    });

    it.each(Object.keys(SUMMARY))('fails when %s is missing', (field) => {
      const { [field as keyof typeof SUMMARY]: _removed, ...rest } = SUMMARY;

      const parsed = meetingSummarySchema.safeParse(rest);

      expect(parsed.success).toBe(false);
      expect(!parsed.success && parsed.error.issues.map((issue) => issue.path)).toEqual([[field]]);
    });

    it.each([
      ['id', 12],
      ['title', null],
      ['scheduledAt', 1_900_000_000_000],
      ['scheduledAt', '2030-03-17'],
      ['location', ['Room 1']],
    ])('fails when %s is %j', (field, value) => {
      expect(meetingSummarySchema.safeParse({ ...SUMMARY, [field]: value }).success).toBe(false);
    });

    it.each([null, 'text', 12, [], undefined])('fails for %j instead of an object', (value) => {
      expect(meetingSummarySchema.safeParse(value).success).toBe(false);
    });
  });

  describe('a meeting', () => {
    it('reads the wire of a meeting with its agenda, its documents and its participants', () => {
      const parsed = meetingSchema.safeParse(overTheWire(MEETING));

      expect(parsed.success).toBe(true);
    });

    it.each(['agenda', 'documents', 'participants'])(
      'fails when %s is missing or not a list',
      (field) => {
        expect(meetingSchema.safeParse(changed((wire) => delete wire[field])).success).toBe(false);
        expect(meetingSchema.safeParse(changed((wire) => (wire[field] = 'none'))).success).toBe(
          false,
        );
        expect(meetingSchema.safeParse(changed((wire) => (wire[field] = null))).success).toBe(
          false,
        );
      },
    );

    it.each([
      [
        'an agenda item without a title',
        (wire: Record<string, unknown>) =>
          delete (wire.agenda as Record<string, unknown>[])[1]?.title,
      ],
      [
        'an agenda item with a position that is text',
        (wire: Record<string, unknown>) => {
          ((wire.agenda as Record<string, unknown>[])[1] as Record<string, unknown>).position = '2';
        },
      ],
      [
        'a resolution without a status',
        (wire: Record<string, unknown>) =>
          delete (
            ((wire.agenda as Record<string, unknown>[])[1] as Record<string, unknown>)
              .resolution as Record<string, unknown>
          ).status,
      ],
      [
        'a resolution whose closing time is not an instant',
        (wire: Record<string, unknown>) => {
          (
            ((wire.agenda as Record<string, unknown>[])[1] as Record<string, unknown>)
              .resolution as Record<string, unknown>
          ).closesAt = 'tomorrow';
        },
      ],
      [
        'a document without a page count',
        (wire: Record<string, unknown>) =>
          delete (wire.documents as Record<string, unknown>[])[0]?.pageCount,
      ],
      [
        'a document with a page count that is text',
        (wire: Record<string, unknown>) => {
          ((wire.documents as Record<string, unknown>[])[0] as Record<string, unknown>).pageCount =
            '3';
        },
      ],
      [
        'a participant without a role',
        (wire: Record<string, unknown>) =>
          delete (wire.participants as Record<string, unknown>[])[0]?.role,
      ],
      [
        'a participant with no name',
        (wire: Record<string, unknown>) => {
          (
            (wire.participants as Record<string, unknown>[])[0] as Record<string, unknown>
          ).fullName = null;
        },
      ],
    ])('fails for %s, and names where', (_name, change) => {
      const parsed = meetingSchema.safeParse(changed(change));

      expect(parsed.success).toBe(false);
    });

    it('ignores the fields it does not know at every level', () => {
      const wire = changed((copy) => {
        copy.extra = true;
        (copy.agenda as Record<string, unknown>[]).forEach((item) => (item.extra = 1));
        (copy.participants as Record<string, unknown>[]).forEach((who) => (who.extra = 1));
        (copy.documents as Record<string, unknown>[]).forEach((document) => (document.extra = 1));
      });

      expect(meetingSchema.safeParse(wire).success).toBe(true);
    });
  });

  describe('a page', () => {
    it('reads items with a cursor, and items without one', () => {
      expect(meetingPageSchema.safeParse({ items: [SUMMARY], nextCursor: 'c' }).success).toBe(true);
      expect(meetingPageSchema.safeParse({ items: [] }).success).toBe(true);
    });

    it.each([
      ['no items', {}],
      ['items that are not a list', { items: SUMMARY }],
      ['an item that is not a summary', { items: [{ id: 'a' }] }],
      ['a cursor that is a number', { items: [], nextCursor: 12 }],
      ['a cursor that is null', { items: [], nextCursor: null }],
    ])('fails for %s', (_name, wire) => {
      expect(meetingPageSchema.safeParse(wire).success).toBe(false);
    });
  });
});

describe('the mappers of meetings', () => {
  describe('from the domain to the wire and back', () => {
    it.each([
      ['a meeting with one open resolution', aMeeting()],
      ['a meeting with a longer agenda', aMeetingWithAgenda()],
      [
        'a meeting with a resolution that has a closing time and a recorded vote',
        aMeeting({
          agenda: [
            anAgendaItem({
              description: 'With a description',
              resolution: aResolution({
                status: RESOLUTION_STATUS.Closed,
                closesAt: at(5 * 3_600_000),
                recordedVote: VOTE_CHOICE.Against,
              }),
            }),
          ],
        }),
      ],
    ])('gives the meeting back as it was: %s', (_name, meeting) => {
      const parsed = meetingSchema.parse(overTheWire(toMeetingWire(meeting)));

      expect(toMeeting(parsed)).toStrictEqual({ ok: true, value: meeting });
    });

    it('gives back every meeting of the seed of the simulated server, as it was', () => {
      const seed = buildSeed(NOW);
      if (!seed.ok) throw new Error('The seed is invalid.');

      for (const meeting of seed.value.content.meetings) {
        const parsed = meetingSchema.parse(overTheWire(toMeetingWire(meeting)));
        expect(toMeeting(parsed)).toStrictEqual({ ok: true, value: meeting });
      }
    });

    it('writes an instant as an ISO 8601 string, and leaves out what is absent', () => {
      const wire = toMeetingWire(aMeeting());

      expect(wire.scheduledAt).toBe('2030-03-18T17:46:40.000Z');
      const resolution = wire.agenda[0]?.resolution;
      expect(resolution).not.toHaveProperty('closesAt');
      expect(resolution).not.toHaveProperty('recordedVote');
      expect(wire.agenda[0]).not.toHaveProperty('description');
    });

    it('gives a summary back as it was', () => {
      const summary = aMeetingSummary();

      expect(
        toMeetingSummary(meetingSummarySchema.parse(overTheWire(toMeetingSummaryWire(summary)))),
      ).toStrictEqual({
        ok: true,
        value: summary,
      });
    });

    it('gives a page back as it was, with its cursor or without one', () => {
      const withCursor = createPage([aMeetingSummary()], unwrap(parsePageCursor('next')));
      const last = createPage([aMeetingSummary(), aMeetingSummary()]);

      for (const page of [withCursor, last, createPage([])]) {
        const parsed = meetingPageSchema.parse(overTheWire(toMeetingPageWire(page)));
        expect(toMeetingPage(parsed)).toStrictEqual({ ok: true, value: page });
      }
    });
  });

  describe('through the factories of the domain', () => {
    const rejects = (
      change: (wire: Record<string, unknown>) => void,
      field: string,
      rule?: string,
    ) => {
      const parsed = meetingSchema.parse(changed(change));
      const mapped = toMeeting(parsed);

      expect(mapped.ok).toBe(false);
      expect(!mapped.ok && mapped.error).toMatchObject(
        rule === undefined ? { field } : { field, rule },
      );
    };

    const item = (wire: Record<string, unknown>, position: number) =>
      (wire.agenda as Record<string, unknown>[])[position] as Record<string, unknown>;

    it('refuses a blank title and a title that is too long', () => {
      rejects((wire) => (wire.title = '   '), VALIDATION_FIELD.Title, VALIDATION_RULE.Required);
      rejects(
        (wire) => (wire.title = 'x'.repeat(301)),
        VALIDATION_FIELD.Title,
        VALIDATION_RULE.TooLong,
      );
    });

    it('refuses an id that is blank', () => {
      rejects((wire) => (wire.id = ' '), VALIDATION_FIELD.MeetingId, VALIDATION_RULE.Required);
    });

    it('refuses a status nobody knows', () => {
      rejects(
        (wire) => ((item(wire, 1).resolution as Record<string, unknown>).status = 'archived'),
        VALIDATION_FIELD.ResolutionStatus,
        VALIDATION_RULE.UnknownValue,
      );
    });

    it('refuses a vote choice nobody knows', () => {
      rejects(
        (wire) => ((item(wire, 1).resolution as Record<string, unknown>).recordedVote = 'maybe'),
        VALIDATION_FIELD.VoteChoice,
        VALIDATION_RULE.UnknownValue,
      );
    });

    it('refuses a role and a confidentiality level nobody knows', () => {
      rejects(
        (wire) =>
          (((wire.participants as Record<string, unknown>[])[0] as Record<string, unknown>).role =
            'owner'),
        VALIDATION_FIELD.ParticipantRole,
      );
      rejects(
        (wire) =>
          ((
            (wire.documents as Record<string, unknown>[])[0] as Record<string, unknown>
          ).confidentiality = 'secret'),
        VALIDATION_FIELD.ConfidentialityLevel,
      );
    });

    it('refuses a position that is not a whole number and a page count out of range', () => {
      rejects(
        (wire) => (item(wire, 1).position = 1.5),
        VALIDATION_FIELD.Position,
        VALIDATION_RULE.NotAnInteger,
      );
      rejects(
        (wire) =>
          (((wire.documents as Record<string, unknown>[])[0] as Record<string, unknown>).pageCount =
            0),
        VALIDATION_FIELD.PageCount,
        VALIDATION_RULE.OutOfRange,
      );
    });

    it('refuses a closing time and a scheduled time the domain cannot hold', () => {
      rejects(
        (wire) => (wire.scheduledAt = '-000001-01-01T00:00:00.000Z'),
        VALIDATION_FIELD.Instant,
      );
    });

    it('refuses two agenda items with the same position, and two participants with the same id', () => {
      rejects(
        (wire) => (item(wire, 2).position = 2),
        VALIDATION_FIELD.Agenda,
        VALIDATION_RULE.Duplicate,
      );
      rejects(
        (wire) => {
          const people = wire.participants as Record<string, unknown>[];
          (people[1] as Record<string, unknown>).userId = (
            people[0] as Record<string, unknown>
          ).userId;
        },
        VALIDATION_FIELD.Participants,
        VALIDATION_RULE.Duplicate,
      );
    });

    it('refuses a page whose item or cursor the domain refuses', () => {
      const blankCursor = meetingPageSchema.parse({ items: [], nextCursor: '  ' });
      const blankItem = meetingPageSchema.parse({ items: [{ ...SUMMARY, title: ' ' }] });

      expect(toMeetingPage(blankCursor).ok).toBe(false);
      expect(toMeetingPage(blankItem).ok).toBe(false);
    });
  });
});
