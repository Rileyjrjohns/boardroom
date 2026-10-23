import { FIRST_GENERATION, databaseFileName, formatKeyState, parseKeyState } from './databaseKey';

const KEY = '0123456789abcdef'.repeat(4);

describe('the state of the key', () => {
  it('is written as the generation and the key, and read back', () => {
    const written = formatKeyState({ generation: 3, key: KEY });

    expect(written).toBe(`3:${KEY}`);
    expect(parseKeyState(written)).toEqual({ generation: 3, key: KEY });
  });

  it('reads a bare key as the key of the first file: that is what an app with one file kept', () => {
    expect(parseKeyState(KEY)).toEqual({ generation: FIRST_GENERATION, key: KEY });
  });

  it.each([
    '',
    ' ',
    'key',
    `${KEY} `,
    ` ${KEY}`,
    `1:${KEY.slice(1)}`,
    `1:${KEY.toUpperCase()}`,
    `:${KEY}`,
    `x:${KEY}`,
    `-1:${KEY}`,
    `1.5:${KEY}`,
    `1234567:${KEY}`,
    `1:${KEY}:2`,
    `1:${KEY}\n`,
  ])('does not read %j as a state', (item) => {
    expect(parseKeyState(item)).toBeUndefined();
  });
});

describe('databaseFileName', () => {
  it('is the name itself for the first generation, so that an existing file is found', () => {
    expect(databaseFileName('boardroom.db', FIRST_GENERATION)).toBe('boardroom.db');
  });

  it('is another name for each generation after, so that no file is ever created over another', () => {
    const names = [0, 1, 2, 10].map((generation) => databaseFileName('boardroom.db', generation));

    expect(names).toEqual(['boardroom.db', 'boardroom.db.1', 'boardroom.db.2', 'boardroom.db.10']);
    expect(new Set(names).size).toBe(names.length);
  });
});
