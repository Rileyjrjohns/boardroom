// A tiny PDF writer, in plain TypeScript: just enough to give the demo documents a content that a
// real PDF reader opens. One page of A4 for each page of the document, showing its title and
// "page i / n", in the standard fonts that every reader has (Helvetica), so there is nothing to
// embed: no font file, no image, no compression. It is not a library: it writes the objects of a
// document that has pages of text, and nothing else.
//
// A PDF is a list of numbered objects, a table that says where each one starts in the file
// (`xref`), and a trailer that says where the table starts. Every offset is a number of bytes, so
// the file is built as a string in which one character is one byte (Latin-1, which the text
// encoding below keeps to), and converted at the end.

/**
 * The most pages a demo document gets, whatever the document says it has: the metadata of a
 * document may announce thousands of pages, and a demo does not need a file that long. The page
 * indicator of the viewer shows what the file has.
 */
export const DEMO_PDF_MAX_PAGES = 100;

export interface DocumentPdfSpec {
  /** The title of the document, printed on every page. */
  readonly title: string;
  /** The number of pages the document says it has; the file has at most `DEMO_PDF_MAX_PAGES`. */
  readonly pageCount: number;
}

/** A4, in points. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;

const TITLE_FONT_SIZE = 20;
const TITLE_LEADING = 26;
const LABEL_FONT_SIZE = 14;
/**
 * How many characters of the title fit on a line. Helvetica Bold is about 0.6 em wide on average
 * for text, so 36 characters of 20 points take about 430 of the 483 points between the margins.
 */
const TITLE_LINE_CHARACTERS = 36;
const TITLE_TOP = PAGE_HEIGHT - MARGIN - TITLE_FONT_SIZE;
const LABEL_BOTTOM = MARGIN;

const FIRST_PAGE_OBJECT = 5;
const OBJECTS_PER_PAGE = 2;
const CATALOG = 1;
const PAGES = 2;
const REGULAR_FONT = 3;
const BOLD_FONT = 4;
/** The names the page resources give the two fonts, which the drawing instructions use. */
const REGULAR_FONT_NAME = 'F1';
const BOLD_FONT_NAME = 'F2';

const HEADER = '%PDF-1.4\n';
/** Bytes above 127 in the second line tell programs that the file is binary, as the format advises. */
const BINARY_MARKER = '%âãÏÓ\n';
const SUBSTITUTE = 0x3f;
const SPACE = 0x20;

/** The code points of the Windows-1252 range 0x80-0x9f that the standard fonts show, and their byte. */
const WIN_ANSI_SPECIALS = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

/** The byte that shows a character in the standard fonts (WinAnsi), or `?` for one they lack. */
function winAnsiByte(codePoint: number): number {
  if (codePoint < SPACE) return SPACE;
  if (codePoint <= 0x7e) return codePoint;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint;
  return WIN_ANSI_SPECIALS.get(codePoint) ?? SUBSTITUTE;
}

/** A text as a PDF string literal: its characters in WinAnsi, with the three that mean something escaped. */
export function pdfLiteral(text: string): string {
  let literal = '';
  for (const character of text) {
    const byte = winAnsiByte(character.codePointAt(0) ?? SUBSTITUTE);
    const written = String.fromCharCode(byte);
    literal += written === '(' || written === ')' || written === '\\' ? `\\${written}` : written;
  }
  return `(${literal})`;
}

/**
 * The title cut into lines of at most `limit` characters, at spaces where it can be and in the
 * middle of a word that is longer than a line. Runs of white space count as one space.
 */
export function wrapText(text: string, limit: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((part) => part !== '')) {
    let rest = word;
    while (rest.length > limit) {
      if (line !== '') {
        lines.push(line);
        line = '';
      }
      lines.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (line === '') line = rest;
    else if (line.length + 1 + rest.length <= limit) line = `${line} ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** How many pages the file of a document has. */
export function pdfPageCountOf(pageCount: number): number {
  if (!Number.isFinite(pageCount)) return 1;
  return Math.min(Math.max(Math.trunc(pageCount), 1), DEMO_PDF_MAX_PAGES);
}

/** The drawing instructions of one page: the title at the top and the page label at the bottom. */
function pageContent(titleLines: readonly string[], page: number, total: number): string {
  const title = titleLines.map((line) => `${pdfLiteral(line)} Tj`).join('\nT*\n');
  return [
    'BT',
    `/${BOLD_FONT_NAME} ${TITLE_FONT_SIZE} Tf`,
    `${TITLE_LEADING} TL`,
    `${MARGIN} ${TITLE_TOP} Td`,
    title,
    'ET',
    'BT',
    `/${REGULAR_FONT_NAME} ${LABEL_FONT_SIZE} Tf`,
    `${MARGIN} ${LABEL_BOTTOM} Td`,
    `${pdfLiteral(`page ${page} / ${total}`)} Tj`,
    'ET',
  ].join('\n');
}

/** The bytes of the file: one per character, which the text keeps below 256. */
function toBytes(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

/** A valid PDF for a document: one page of its title and its page label for each of its pages. */
export function createDocumentPdf({ title, pageCount }: DocumentPdfSpec): Uint8Array<ArrayBuffer> {
  const total = pdfPageCountOf(pageCount);
  const titleLines = wrapText(title, TITLE_LINE_CHARACTERS);

  const objects: string[] = [];
  const pageObject = (index: number): number => FIRST_PAGE_OBJECT + OBJECTS_PER_PAGE * index;

  objects[CATALOG] = `<< /Type /Catalog /Pages ${PAGES} 0 R >>`;
  objects[PAGES] = [
    '<< /Type /Pages',
    `/Kids [${Array.from({ length: total }, (_unused, index) => `${pageObject(index)} 0 R`).join(' ')}]`,
    `/Count ${total} >>`,
  ].join(' ');
  objects[REGULAR_FONT] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[BOLD_FONT] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  for (let index = 0; index < total; index += 1) {
    const content = pageContent(titleLines, index + 1, total);
    objects[pageObject(index)] = [
      `<< /Type /Page /Parent ${PAGES} 0 R`,
      `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`,
      `/Resources << /Font << /${REGULAR_FONT_NAME} ${REGULAR_FONT} 0 R /${BOLD_FONT_NAME} ${BOLD_FONT} 0 R >> >>`,
      `/Contents ${pageObject(index) + 1} 0 R >>`,
    ].join(' ');
    objects[pageObject(index) + 1] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  let file = `${HEADER}${BINARY_MARKER}`;
  const offsets: number[] = [];
  for (let number = 1; number < objects.length; number += 1) {
    offsets[number] = file.length;
    file += `${number} 0 obj\n${objects[number] ?? ''}\nendobj\n`;
  }

  // The table: one line of exactly 20 bytes for each object, the free entry 0 first.
  const size = objects.length;
  const tableOffset = file.length;
  const lines = ['0000000000 65535 f '];
  for (let number = 1; number < size; number += 1) {
    lines.push(`${String(offsets[number]).padStart(10, '0')} 00000 n `);
  }
  file += `xref\n0 ${size}\n${lines.join('\n')}\n`;
  file += `trailer\n<< /Size ${size} /Root ${CATALOG} 0 R >>\nstartxref\n${tableOffset}\n%%EOF\n`;

  return toBytes(file);
}
