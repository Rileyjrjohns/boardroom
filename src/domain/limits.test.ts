import { createAgendaItem } from './entities/AgendaItem';
import { CONFIDENTIALITY_LEVEL, createDocument } from './entities/Document';
import { createMeetingSummary } from './entities/MeetingSummary';
import { restorePendingVote } from './entities/OutboxVote';
import { PARTICIPANT_ROLE, createParticipant } from './entities/Participant';
import { RESOLUTION_STATUS, createResolution } from './entities/Resolution';
import { createUser } from './entities/User';
import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from './errors/ValidationError';
import type { ValidationField } from './errors/ValidationError';
import { err } from './shared/Result';
import type { Result } from './shared/Result';
import {
  NOW,
  aDocumentId,
  aMeetingId,
  aResolutionId,
  aUserId,
  aVote,
  anAgendaItemId,
  anEmail,
} from './testing/builders';
import { parseDocumentLocation } from './value-objects/DocumentLocation';
import { durationFromMillis } from './value-objects/Duration';
import { parseEmailAddress } from './value-objects/EmailAddress';
import {
  parseAgendaItemId,
  parseDocumentId,
  parseMeetingId,
  parseResolutionId,
  parseUserId,
} from './value-objects/ids';
import { parseInstant } from './value-objects/Instant';
import { parsePageCursor } from './value-objects/PageCursor';
import { createPageRequest } from './value-objects/PageRequest';

// Every limit of the domain, at its exact value: the maximum is accepted, one more is rejected
// (and, for a number, the minimum is accepted and one less is rejected).

type Check = Result<unknown, unknown>;

const LONG_TEXTS: readonly [string, (length: number) => Check, number, ValidationField][] = [
  [
    'an email address',
    (n) => parseEmailAddress(`${'a'.repeat(n - '@b.co'.length)}@b.co`),
    254,
    VALIDATION_FIELD.Email,
  ],
  [
    'a document location',
    (n) => parseDocumentLocation('a'.repeat(n)),
    2048,
    VALIDATION_FIELD.DocumentLocation,
  ],
  ['a page cursor', (n) => parsePageCursor('a'.repeat(n)), 512, VALIDATION_FIELD.PageCursor],
  ['a user id', (n) => parseUserId('a'.repeat(n)), 128, VALIDATION_FIELD.UserId],
  ['a meeting id', (n) => parseMeetingId('a'.repeat(n)), 128, VALIDATION_FIELD.MeetingId],
  [
    'an agenda item id',
    (n) => parseAgendaItemId('a'.repeat(n)),
    128,
    VALIDATION_FIELD.AgendaItemId,
  ],
  ['a resolution id', (n) => parseResolutionId('a'.repeat(n)), 128, VALIDATION_FIELD.ResolutionId],
  ['a document id', (n) => parseDocumentId('a'.repeat(n)), 128, VALIDATION_FIELD.DocumentId],
  [
    'the name of a user',
    (n) => createUser({ id: aUserId(), fullName: 'a'.repeat(n), email: anEmail() }),
    200,
    VALIDATION_FIELD.FullName,
  ],
  [
    'the name of a participant',
    (n) =>
      createParticipant({
        userId: aUserId(),
        fullName: 'a'.repeat(n),
        role: PARTICIPANT_ROLE.Member,
      }),
    200,
    VALIDATION_FIELD.FullName,
  ],
  [
    'the title of a document',
    (n) =>
      createDocument({
        id: aDocumentId(),
        title: 'a'.repeat(n),
        confidentiality: CONFIDENTIALITY_LEVEL.Internal,
        pageCount: 1,
      }),
    300,
    VALIDATION_FIELD.Title,
  ],
  [
    'the title of a resolution',
    (n) =>
      createResolution({
        id: aResolutionId(),
        title: 'a'.repeat(n),
        description: 'd',
        status: RESOLUTION_STATUS.Open,
      }),
    300,
    VALIDATION_FIELD.Title,
  ],
  [
    'the description of a resolution',
    (n) =>
      createResolution({
        id: aResolutionId(),
        title: 't',
        description: 'a'.repeat(n),
        status: RESOLUTION_STATUS.Open,
      }),
    5000,
    VALIDATION_FIELD.Description,
  ],
  [
    'the title of an agenda item',
    (n) => createAgendaItem({ id: anAgendaItemId(), position: 1, title: 'a'.repeat(n) }),
    300,
    VALIDATION_FIELD.Title,
  ],
  [
    'the description of an agenda item',
    (n) =>
      createAgendaItem({
        id: anAgendaItemId(),
        position: 1,
        title: 't',
        description: 'a'.repeat(n),
      }),
    5000,
    VALIDATION_FIELD.Description,
  ],
  [
    'the title of a meeting',
    (n) =>
      createMeetingSummary({
        id: aMeetingId(),
        title: 'a'.repeat(n),
        scheduledAt: NOW,
        location: 'l',
      }),
    300,
    VALIDATION_FIELD.Title,
  ],
  [
    'the location of a meeting',
    (n) =>
      createMeetingSummary({
        id: aMeetingId(),
        title: 't',
        scheduledAt: NOW,
        location: 'a'.repeat(n),
      }),
    300,
    VALIDATION_FIELD.Location,
  ],
];

const NUMBERS: readonly [string, (value: number) => Check, number, number, ValidationField][] = [
  [
    'the position of an agenda item',
    (position) => createAgendaItem({ id: anAgendaItemId(), position, title: 't' }),
    1,
    1000,
    VALIDATION_FIELD.Position,
  ],
  [
    'the page count of a document',
    (pageCount) =>
      createDocument({
        id: aDocumentId(),
        title: 't',
        confidentiality: CONFIDENTIALITY_LEVEL.Internal,
        pageCount,
      }),
    1,
    10_000,
    VALIDATION_FIELD.PageCount,
  ],
  [
    'the attempts of a pending vote',
    (attempts) => restorePendingVote({ vote: aVote(), enqueuedAt: NOW, attempts }),
    0,
    1_000_000,
    VALIDATION_FIELD.AttemptCount,
  ],
  [
    'the size of a page',
    (limit) => createPageRequest({ limit }),
    1,
    50,
    VALIDATION_FIELD.PageLimit,
  ],
  ['a duration', durationFromMillis, 0, 3_153_600_000_000, VALIDATION_FIELD.Duration],
  ['an instant', parseInstant, 0, 8_640_000_000_000_000, VALIDATION_FIELD.Instant],
];

describe.each(LONG_TEXTS)('the length of %s', (_name, build, maximum, field) => {
  it(`accepts ${maximum} characters`, () => {
    expect(build(maximum).ok).toBe(true);
  });

  it(`rejects ${maximum + 1} characters as too long`, () => {
    expect(build(maximum + 1)).toEqual(err(validationError(field, VALIDATION_RULE.TooLong)));
  });
});

describe.each(NUMBERS)('%s', (_name, build, minimum, maximum, field) => {
  it(`accepts ${minimum} and ${maximum}`, () => {
    expect(build(minimum).ok).toBe(true);
    expect(build(maximum).ok).toBe(true);
  });

  it(`rejects ${minimum - 1} and ${maximum + 1}`, () => {
    const outOfRange = err(validationError(field, VALIDATION_RULE.OutOfRange));

    expect(build(minimum - 1)).toEqual(outOfRange);
    expect(build(maximum + 1)).toEqual(outOfRange);
  });
});
