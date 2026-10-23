import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err } from '@core/domain/shared/Result';
import {
  aDocument,
  aDocumentId,
  aMeeting,
  aMeetingWithAgenda,
  aMeetingSummary,
  aParticipant,
  aResolution,
  aResolutionId,
  aUserId,
  anAgendaItem,
  anAgendaItemId,
  unwrap,
} from '@testing/domain/builders';

import { createAgendaItem } from './AgendaItem';
import { createMeeting, findParticipant, findResolution } from './Meeting';

/** An agenda item with neither description nor resolution. */
function plainItem(id: string, position: number) {
  return unwrap(createAgendaItem({ id: anAgendaItemId(id), position, title: `Item ${position}` }));
}

const BASE = {
  summary: aMeetingSummary(),
  agenda: [] as ReturnType<typeof anAgendaItem>[],
  documents: [] as ReturnType<typeof aDocument>[],
  participants: [] as ReturnType<typeof aParticipant>[],
};

describe('createMeeting', () => {
  it('spreads the summary fields and sorts the agenda by position', () => {
    const second = anAgendaItem({
      id: anAgendaItemId('agenda-2'),
      position: 2,
      resolution: aResolution({ id: aResolutionId('resolution-2') }),
    });
    const first = anAgendaItem({ position: 1 });

    const meeting = unwrap(createMeeting({ ...BASE, agenda: [second, first] }));

    expect(meeting).toEqual({
      ...aMeetingSummary(),
      agenda: [first, second],
      documents: [],
      participants: [],
    });
  });

  it('does not reorder the agenda it is given', () => {
    const second = anAgendaItem({
      id: anAgendaItemId('agenda-2'),
      position: 2,
      resolution: aResolution({ id: aResolutionId('resolution-2') }),
    });
    const agenda = [second, anAgendaItem({ position: 1 })];

    unwrap(createMeeting({ ...BASE, agenda }));

    expect(agenda[0]).toBe(second);
  });

  it('copies the agenda, the documents and the participants it is given', () => {
    const agenda = [anAgendaItem()];
    const documents = [aDocument()];
    const participants = [aParticipant()];
    const meeting = unwrap(createMeeting({ ...BASE, agenda, documents, participants }));

    agenda.push(plainItem('agenda-9', 9));
    documents.push(aDocument({ id: aDocumentId('document-2') }));
    participants.push(aParticipant({ userId: aUserId('user-9') }));

    expect(meeting.agenda).toHaveLength(1);
    expect(meeting.documents).toHaveLength(1);
    expect(meeting.participants).toHaveLength(1);
  });

  it('accepts an agenda item without resolution', () => {
    const meeting = unwrap(
      createMeeting({ ...BASE, agenda: [anAgendaItem(), plainItem('agenda-2', 2)] }),
    );

    expect(meeting.agenda).toHaveLength(2);
    expect(findResolution(meeting, aResolutionId())).toEqual(aResolution());
  });

  it.each([
    [
      'two agenda items with the same id, neither of them with a resolution',
      { agenda: [plainItem('agenda-1', 1), plainItem('agenda-1', 2)] },
      VALIDATION_FIELD.Agenda,
    ],
    [
      'two agenda items at the same position, neither of them with a resolution',
      { agenda: [plainItem('agenda-1', 1), plainItem('agenda-2', 1)] },
      VALIDATION_FIELD.Agenda,
    ],
    [
      'two resolutions with the same id, in items that differ in everything else',
      {
        agenda: [
          anAgendaItem({ id: anAgendaItemId('agenda-1'), position: 1 }),
          anAgendaItem({ id: anAgendaItemId('agenda-2'), position: 2 }),
        ],
      },
      VALIDATION_FIELD.Agenda,
    ],
    [
      'two documents with the same id',
      { documents: [aDocument(), aDocument()] },
      VALIDATION_FIELD.Documents,
    ],
    [
      'two participants with the same user id',
      { participants: [aParticipant(), aParticipant()] },
      VALIDATION_FIELD.Participants,
    ],
  ])('rejects %s', (_name, overrides, field) => {
    expect(createMeeting({ ...BASE, ...overrides })).toEqual(
      err(validationError(field, VALIDATION_RULE.Duplicate)),
    );
  });

  it('accepts items that differ in id, position and resolution', () => {
    expect(
      createMeeting({
        ...BASE,
        agenda: [
          plainItem('agenda-1', 1),
          plainItem('agenda-2', 2),
          anAgendaItem({ id: anAgendaItemId('agenda-3'), position: 3 }),
        ],
      }).ok,
    ).toBe(true);
  });
});

describe('findResolution', () => {
  const meeting = aMeetingWithAgenda();

  it('finds a resolution in any item of the agenda: the second item and the third, not only the first', () => {
    expect(findResolution(meeting, aResolutionId())).toEqual(aResolution());
    expect(findResolution(meeting, aResolutionId('resolution-2'))?.title).toBe('Elect the chair');
  });

  it('finds the only resolution of a single-item agenda', () => {
    expect(findResolution(aMeeting(), aResolutionId())).toEqual(aResolution());
  });

  it('returns undefined for an unknown resolution', () => {
    expect(findResolution(meeting, aResolutionId('unknown'))).toBeUndefined();
    expect(findResolution(aMeeting(), aResolutionId('unknown'))).toBeUndefined();
  });

  it('returns undefined when no item has a resolution', () => {
    const empty = unwrap(createMeeting({ ...BASE, agenda: [plainItem('agenda-1', 1)] }));

    expect(findResolution(empty, aResolutionId())).toBeUndefined();
  });
});

describe('findParticipant', () => {
  it('finds a participant by user id', () => {
    expect(findParticipant(aMeeting(), aUserId('user-2'))?.fullName).toBe('Bruno Durand');
  });

  it('returns undefined for somebody who is not invited', () => {
    expect(findParticipant(aMeeting(), aUserId('stranger'))).toBeUndefined();
  });
});
