import { hasPdfSignature } from '@features/documents/infrastructure/pdfSignature';

import {
  DEMO_PDF_MAX_PAGES,
  createDocumentPdf,
  pdfLiteral,
  pdfPageCountOf,
  wrapText,
} from './createDocumentPdf';

// The writer is tested by reading back what it writes, the way a reader does: the header, then the
// end of the file to find the table of offsets, then each object where the table says it is, then
// the pages from the tree that starts at the root of the trailer. A reader that cannot find an
// object where the table says is the failure these checks are made to catch.

const text = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

interface ParsedPdf {
  readonly version: string;
  readonly size: number;
  readonly root: number;
  readonly objects: Map<number, string>;
  readonly pageContents: string[];
}

/** Reads a file the way a reader would, and fails the test on anything a reader would refuse. */
function parse(bytes: Uint8Array): ParsedPdf {
  const file = text(bytes);
  const header = /^%PDF-(\d\.\d)\n/.exec(file);
  if (header === null) throw new Error('no header');

  expect(file.endsWith('\n%%EOF\n')).toBe(true);
  const start = /startxref\n(\d+)\n%%EOF\n$/.exec(file);
  if (start === null) throw new Error('no startxref');
  const tableOffset = Number(start[1]);
  expect(file.slice(tableOffset, tableOffset + 5)).toBe('xref\n');

  const table = /^xref\n0 (\d+)\n/.exec(file.slice(tableOffset));
  if (table === null) throw new Error('no table');
  const size = Number(table[1]);
  const entriesAt = tableOffset + table[0].length;
  const entries = Array.from({ length: size }, (_unused, index) =>
    file.slice(entriesAt + index * 20, entriesAt + (index + 1) * 20),
  );
  // Every entry is exactly 20 bytes: ten digits, a space, five digits, a space, n or f, a space, a line feed.
  for (const entry of entries) expect(entry).toMatch(/^\d{10} \d{5} [nf] \n$/);
  expect(entries[0]).toBe('0000000000 65535 f \n');
  expect(file.slice(entriesAt + size * 20, entriesAt + size * 20 + 8)).toBe('trailer\n');

  const trailer = /trailer\n<< \/Size (\d+) \/Root (\d+) 0 R >>\nstartxref/.exec(file);
  if (trailer === null) throw new Error('no trailer');

  const objects = new Map<number, string>();
  entries.slice(1).forEach((entry, index) => {
    const number = index + 1;
    const offset = Number(entry.slice(0, 10));
    const object = new RegExp(`^${number} 0 obj\\n([\\s\\S]*?)\\nendobj\\n`).exec(
      file.slice(offset),
    );
    if (object === null) throw new Error(`object ${number} is not at ${offset}`);
    objects.set(number, object[1] ?? '');
  });

  const catalog = objects.get(Number(trailer[2])) ?? '';
  const pagesNumber = Number(/\/Pages (\d+) 0 R/.exec(catalog)?.[1]);
  const pages = objects.get(pagesNumber) ?? '';
  const kids = [...(/\/Kids \[([^\]]*)\]/.exec(pages)?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map(
    (match) => Number(match[1]),
  );
  expect(Number(/\/Count (\d+)/.exec(pages)?.[1])).toBe(kids.length);

  const pageContents = kids.map((kid) => {
    const page = objects.get(kid) ?? '';
    expect(page).toContain('/Type /Page ');
    expect(page).toContain(`/Parent ${pagesNumber} 0 R`);
    const content = objects.get(Number(/\/Contents (\d+) 0 R/.exec(page)?.[1])) ?? '';
    const stream = /^<< \/Length (\d+) >>\nstream\n([\s\S]*)\nendstream$/.exec(content);
    if (stream === null) throw new Error('no stream');
    expect(stream[2]?.length).toBe(Number(stream[1]));
    return stream[2] ?? '';
  });

  return {
    version: header[1] ?? '',
    size: Number(trailer[1]),
    root: Number(trailer[2]),
    objects,
    pageContents,
  };
}

describe('createDocumentPdf', () => {
  it('writes a file that starts like a PDF and ends like one', () => {
    const bytes = createDocumentPdf({ title: 'Financial statements', pageCount: 3 });

    expect(hasPdfSignature(bytes)).toBe(true);
    expect(text(bytes).startsWith('%PDF-1.4\n')).toBe(true);
    expect(
      text(bytes).endsWith('startxref\n' + /startxref\n(\d+)/.exec(text(bytes))?.[1] + '\n%%EOF\n'),
    ).toBe(true);
  });

  it('says in the second line that the file is binary', () => {
    const second = text(createDocumentPdf({ title: 'A', pageCount: 1 })).split('\n')[1] ?? '';

    expect(second.startsWith('%')).toBe(true);
    expect([...second.slice(1)].every((character) => character.charCodeAt(0) > 127)).toBe(true);
  });

  it('has its table say where each object is, and the trailer say how many there are and which is the root', () => {
    const parsed = parse(createDocumentPdf({ title: 'Financial statements', pageCount: 3 }));

    expect(parsed.size).toBe(parsed.objects.size + 1);
    expect(parsed.root).toBe(1);
    expect(parsed.objects.get(1)).toContain('/Type /Catalog');
  });

  it('has one page for each page of the document', () => {
    for (const pageCount of [1, 2, 7, 24]) {
      const parsed = parse(createDocumentPdf({ title: 'Annual report', pageCount }));

      expect(parsed.pageContents).toHaveLength(pageCount);
    }
  });

  it('shows the title and "page i / n" on every page', () => {
    const parsed = parse(createDocumentPdf({ title: 'Annual report', pageCount: 4 }));

    parsed.pageContents.forEach((content, index) => {
      expect(content).toContain('(Annual report) Tj');
      expect(content).toContain(`(page ${index + 1} / 4) Tj`);
    });
  });

  it('uses the standard Helvetica fonts, and embeds nothing', () => {
    const file = text(createDocumentPdf({ title: 'A', pageCount: 2 }));

    expect(file).toContain('/BaseFont /Helvetica ');
    expect(file).toContain('/BaseFont /Helvetica-Bold ');
    expect(file).not.toContain('/FontFile');
    expect(file).not.toContain('/Subtype /Image');
    expect(file).not.toContain('/Filter');
  });

  it('gives the page count of the document, up to the maximum of a demo document', () => {
    expect(parse(createDocumentPdf({ title: 'A', pageCount: 10_000 })).pageContents).toHaveLength(
      DEMO_PDF_MAX_PAGES,
    );
    expect(pdfPageCountOf(DEMO_PDF_MAX_PAGES)).toBe(DEMO_PDF_MAX_PAGES);
    expect(pdfPageCountOf(DEMO_PDF_MAX_PAGES + 1)).toBe(DEMO_PDF_MAX_PAGES);
  });

  it('labels the pages with the pages the file has, not the pages the document announces', () => {
    const parsed = parse(createDocumentPdf({ title: 'A', pageCount: 10_000 }));

    expect(parsed.pageContents.at(-1)).toContain(
      `(page ${DEMO_PDF_MAX_PAGES} / ${DEMO_PDF_MAX_PAGES}) Tj`,
    );
  });

  it.each([0, -3, Number.NaN, Number.NEGATIVE_INFINITY, 0.4])(
    'gives a file of one page for %s pages, so that the file is always valid',
    (pageCount) => {
      expect(parse(createDocumentPdf({ title: 'A', pageCount })).pageContents).toHaveLength(1);
      expect(pdfPageCountOf(pageCount)).toBe(1);
    },
  );

  it('rounds a fraction of a page down', () => {
    expect(pdfPageCountOf(2.9)).toBe(2);
  });

  it('writes the same bytes for the same document, so that a version has one content', () => {
    const first = createDocumentPdf({ title: 'Annual report', pageCount: 5 });
    const second = createDocumentPdf({ title: 'Annual report', pageCount: 5 });

    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it('writes other bytes for another title or another page count, so that a new version is told apart', () => {
    const base = createDocumentPdf({ title: 'Annual report', pageCount: 5 });

    expect(Array.from(createDocumentPdf({ title: 'Annual reports', pageCount: 5 }))).not.toEqual(
      Array.from(base),
    );
    expect(Array.from(createDocumentPdf({ title: 'Annual report', pageCount: 6 }))).not.toEqual(
      Array.from(base),
    );
  });

  it('keeps a title with parentheses and a backslash from breaking the strings of the file', () => {
    const parsed = parse(createDocumentPdf({ title: 'Plan (draft) \\ final)', pageCount: 1 }));

    expect(parsed.pageContents[0]).toContain('(Plan \\(draft\\) \\\\ final\\)) Tj');
  });

  it('writes the accents of the standard fonts as the one byte they have, and a character they lack as a question mark', () => {
    const parsed = parse(createDocumentPdf({ title: 'Rémunération € 中 \u{1F3DB}', pageCount: 1 }));

    expect(parsed.pageContents[0]).toContain(
      `(R${String.fromCharCode(0xe9)}mun${String.fromCharCode(0xe9)}ration ${String.fromCharCode(0x80)} ? ?) Tj`,
    );
  });

  it('writes a title that is long on several lines, so that it stays on the page', () => {
    const title =
      'Report of the remuneration committee on the policy for the financial year '.repeat(3);
    const parsed = parse(createDocumentPdf({ title, pageCount: 1 }));

    const lines = parsed.pageContents[0]?.match(/\) Tj/g) ?? [];
    expect(lines.length).toBeGreaterThan(3);
    expect(parsed.pageContents[0]).toContain('T*');
  });

  it('writes a title of the longest length a document can have', () => {
    expect(() => parse(createDocumentPdf({ title: 'w'.repeat(300), pageCount: 2 }))).not.toThrow();
  });
});

describe('pdfLiteral', () => {
  it('escapes the parentheses and the backslash, and only those', () => {
    expect(pdfLiteral('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)');
  });

  it('turns a control character into a space, so that a line break cannot end the string', () => {
    expect(pdfLiteral('a\nb\rc\u0000d')).toBe('(a b c d)');
  });

  it('knows the characters of Windows-1252 beyond Latin-1', () => {
    expect(pdfLiteral('’“”–—…')).toBe(
      `(${[0x92, 0x93, 0x94, 0x96, 0x97, 0x85].map((byte) => String.fromCharCode(byte)).join('')})`,
    );
  });
});

describe('wrapText', () => {
  it('keeps a short text on one line, with its white space collapsed', () => {
    expect(wrapText('  A   short \n title ', 36)).toEqual(['A short title']);
  });

  it('breaks at spaces, never beyond the limit', () => {
    const lines = wrapText('one two three four five six seven', 10);

    expect(lines).toEqual(['one two', 'three four', 'five six', 'seven']);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
  });

  it('cuts a word that is longer than a line', () => {
    expect(wrapText('abcdefghijklmnopqrstuvwxyz', 10)).toEqual([
      'abcdefghij',
      'klmnopqrst',
      'uvwxyz',
    ]);
    expect(wrapText('short abcdefghijklmnop end', 10)).toEqual([
      'short',
      'abcdefghij',
      'klmnop end',
    ]);
  });

  it('gives no line for a text with nothing in it', () => {
    expect(wrapText('   ', 10)).toEqual([]);
  });
});
