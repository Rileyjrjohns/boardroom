import { VALIDATION_FIELD } from '@core/domain/errors/ValidationError';
import { aConfidentialDocument, aDocument } from '@testing/domain/builders';

import { documentSchema, toDocument, toDocumentWire } from './documentDto';

const WIRE = toDocumentWire(aDocument());

describe('the document schema', () => {
  it('reads the wire of a document and ignores the fields it does not know', () => {
    expect(documentSchema.parse({ ...WIRE, extra: 1 })).toEqual(WIRE);
  });

  it.each(Object.keys(WIRE))('fails when %s is missing', (field) => {
    const { [field as keyof typeof WIRE]: _removed, ...rest } = WIRE;

    expect(documentSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ['id', 1],
    ['title', null],
    ['confidentiality', 3],
    ['pageCount', '12'],
  ])('fails when %s is %j', (field, value) => {
    expect(documentSchema.safeParse({ ...WIRE, [field]: value }).success).toBe(false);
  });

  it.each([aDocument(), aConfidentialDocument()])('gives a document back as it was', (document) => {
    const parsed = documentSchema.parse(JSON.parse(JSON.stringify(toDocumentWire(document))));

    expect(toDocument(parsed)).toStrictEqual({ ok: true, value: document });
  });

  it.each([
    ['a level nobody knows', { confidentiality: 'secret' }, VALIDATION_FIELD.ConfidentialityLevel],
    ['a blank title', { title: ' ' }, VALIDATION_FIELD.Title],
    ['a page count of zero', { pageCount: 0 }, VALIDATION_FIELD.PageCount],
    ['a blank id', { id: '' }, VALIDATION_FIELD.DocumentId],
  ])('refuses %s through the factory of the domain', (_name, change, field) => {
    const mapped = toDocument(documentSchema.parse({ ...WIRE, ...change }));

    expect(!mapped.ok && mapped.error).toMatchObject({ field });
  });
});
