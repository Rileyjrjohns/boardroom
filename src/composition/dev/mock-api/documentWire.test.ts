import { NOW } from '@testing/domain/builders';
import {
  documentSchema,
  toDocument,
  toDocumentWire,
} from '@features/documents/infrastructure/dto/documentDto';
import {
  toMeeting,
  toMeetingWire,
  meetingSchema,
} from '@features/meetings/infrastructure/dto/meetingDto';

import { buildSeed } from '../in-memory/seed';

// The documents a meeting lists are the `Document` entity of the meetings, and each feature has its
// own wire form of it: the meetings read and write the documents inside a meeting, the documents
// read and write the metadata of `GET /documents/{id}`. They are not allowed to import each other,
// so nothing but this test says that they are the same JSON.

function aSeed() {
  const seed = buildSeed(NOW);
  if (!seed.ok) throw new Error(`The seed is invalid: ${seed.error.detail}`);
  return seed.value;
}

describe('the wire form of a document', () => {
  const listed = aSeed().content.meetings.flatMap((meeting) => meeting.documents);

  it('is found in the fixtures', () => {
    expect(listed.length).toBeGreaterThan(0);
  });

  it('is the same when a meeting lists the document and when the document is asked for by itself', () => {
    for (const meeting of aSeed().content.meetings) {
      expect(toMeetingWire(meeting).documents).toEqual(meeting.documents.map(toDocumentWire));
    }
  });

  it('is read by the documents as the meetings wrote it, and by the meetings as the documents wrote it', () => {
    for (const meeting of aSeed().content.meetings) {
      for (const document of meeting.documents) {
        expect(toDocument(documentSchema.parse(toDocumentWire(document)))).toEqual({
          ok: true,
          value: document,
        });
      }
      const wire = toMeetingWire(meeting);
      const read = toMeeting(meetingSchema.parse(wire));
      expect(read).toEqual({ ok: true, value: meeting });
    }
  });

  it('is refused by the meetings the way the documents refuse it: a confidentiality nobody knows', () => {
    const [meeting] = aSeed().content.meetings;
    if (meeting === undefined) throw new Error('The seed has no meeting.');
    const [document] = toMeetingWire(meeting).documents;
    if (document === undefined) throw new Error('The meeting lists no document.');
    const broken = { ...document, confidentiality: 'secret' };

    expect(toDocument(documentSchema.parse(broken)).ok).toBe(false);
    expect(
      toMeeting(meetingSchema.parse({ ...toMeetingWire(meeting), documents: [broken] })).ok,
    ).toBe(false);
  });
});
