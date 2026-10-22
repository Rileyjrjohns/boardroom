import fs from 'node:fs';
import path from 'node:path';

// A reader for the Markdown files of docs/spec, in plain string handling. The convention it reads
// is documented in docs/spec/README.md ("Conformance conventions"): a table whose first header cell
// is one of the kind labels is a *checked table*, the first cell of each of its rows holds an
// identifier in backticks, and the *subject* of a table is the first backticked token of the
// nearest preceding heading. Everything else (prose, other tables) is free and is not read here.

/** The kind labels: the first header cell of a checked table. */
export const TABLE_KIND = {
  Code: 'Code',
  Value: 'Value',
  Limit: 'Limit',
  UseCase: 'Use case',
  Setting: 'Setting',
  Constant: 'Constant',
  Port: 'Port',
  Operation: 'Operation',
  Route: 'Route',
  TestId: 'Test id',
  Builder: 'Builder',
} as const;

const CHECKED_KINDS: ReadonlySet<string> = new Set(Object.values(TABLE_KIND));

export interface Heading {
  readonly level: number;
  readonly text: string;
  /** The first backticked token of the heading, if it has one. */
  readonly subject: string | undefined;
  /** The anchor GitHub gives the heading. */
  readonly slug: string;
  readonly line: number;
}

export interface Table {
  /** The first header cell, without backticks. */
  readonly kind: string;
  readonly checked: boolean;
  readonly header: readonly string[];
  /** The cells of each row, trimmed, with `\|` read as `|`. */
  readonly rows: readonly (readonly string[])[];
  /** The first backticked token of the nearest preceding heading, if there is one. */
  readonly subject: string | undefined;
  /** The line of the header, from 1. */
  readonly line: number;
}

export interface Fence {
  readonly language: string;
  readonly body: string;
  readonly line: number;
}

export interface Link {
  readonly target: string;
  readonly line: number;
}

export interface SpecDocument {
  readonly file: string;
  readonly lines: readonly string[];
  readonly headings: readonly Heading[];
  readonly tables: readonly Table[];
  readonly fences: readonly Fence[];
  readonly links: readonly Link[];
}

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE = /^\s*```(.*)$/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const CODE_SPAN = /`([^`]+)`/;
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** The text between the first pair of backticks, or `undefined` when there is none. */
export function firstCode(text: string): string | undefined {
  return CODE_SPAN.exec(text)?.[1];
}

/** Every text between a pair of backticks. */
export function allCodes(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

/** The anchor GitHub gives a heading: lower case, punctuation removed, each space a hyphen. */
export function slugOf(headingText: string): string {
  return headingText
    .replaceAll('`', '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replaceAll(' ', '-');
}

/** Splits a table row at the `|` that are not escaped, and reads `\|` as `|`. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  const text = line.trim();
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === '\\' && text.charAt(index + 1) === '|') {
      current += '|';
      index += 1;
    } else if (char === '|') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  // The row starts and ends with a bar: the pieces before the first and after the last are empty.
  if (text.startsWith('|')) cells.shift();
  if (text.endsWith('|') && !text.endsWith('\\|')) cells.pop();
  return cells.map((cell) => cell.trim());
}

/** Adds the links of a line, outside code spans, to `links`. */
function readLinks(line: string, lineNumber: number, links: Link[]): void {
  for (const match of line.replace(/`[^`]*`/g, '').matchAll(LINK)) {
    if (match[1] !== undefined) links.push({ target: match[1], line: lineNumber });
  }
}

/** Reads a specification file. */
export function parseSpecText(file: string, text: string): SpecDocument {
  const lines = text.split('\n');
  const headings: Heading[] = [];
  const tables: Table[] = [];
  const fences: Fence[] = [];
  const links: Link[] = [];

  let fence: { language: string; body: string[]; line: number } | undefined;
  let subject: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch !== null) {
      if (fence === undefined) {
        fence = { language: (fenceMatch[1] ?? '').trim(), body: [], line: index + 1 };
      } else {
        fences.push({ language: fence.language, body: fence.body.join('\n'), line: fence.line });
        fence = undefined;
      }
      continue;
    }
    if (fence !== undefined) {
      fence.body.push(line);
      continue;
    }

    const headingMatch = HEADING.exec(line);
    if (headingMatch !== null) {
      const text = headingMatch[2] ?? '';
      subject = firstCode(text);
      headings.push({
        level: (headingMatch[1] ?? '').length,
        text,
        subject,
        slug: slugOf(text),
        line: index + 1,
      });
      continue;
    }

    readLinks(line, index + 1, links);

    if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[index + 1] ?? '')) {
      const header = splitRow(line);
      const rows: string[][] = [];
      let next = index + 2;
      while (next < lines.length && TABLE_ROW.test(lines[next] ?? '')) {
        rows.push(splitRow(lines[next] ?? ''));
        readLinks(lines[next] ?? '', next + 1, links);
        next += 1;
      }
      const kind = (header[0] ?? '').replaceAll('`', '');
      tables.push({
        kind,
        checked: CHECKED_KINDS.has(kind),
        header,
        rows,
        subject,
        line: index + 1,
      });
      index = next - 1;
    }
  }

  return { file, lines, headings, tables, fences, links };
}

export function readSpecFile(file: string): SpecDocument {
  return parseSpecText(path.basename(file), fs.readFileSync(file, 'utf8'));
}

/** The checked tables of a kind, in file order. */
export function tablesOfKind(document: SpecDocument, ...kinds: string[]): readonly Table[] {
  return document.tables.filter((table) => table.checked && kinds.includes(table.kind));
}

/** The identifiers (first backticked token of the first cell) of the rows of a table. */
export function identifiersOf(table: Table): string[] {
  return table.rows.map((row) => firstCode(row[0] ?? '') ?? '');
}

/** The lines of a section: from its heading to the next heading of the same or a higher level. */
export function sectionLines(document: SpecDocument, heading: Heading): string[] {
  const end = document.headings.find(
    (other) => other.line > heading.line && other.level <= heading.level,
  );
  return document.lines.slice(heading.line, end === undefined ? undefined : end.line - 1);
}
