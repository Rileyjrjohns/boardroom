import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import { err, ok } from '../shared/Result';
import { unwrap } from '../testing/builders';

import { createPage } from './Page';
import { parsePageCursor } from './PageCursor';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, createPageRequest } from './PageRequest';

describe('parsePageCursor', () => {
  it('keeps an opaque cursor, trimmed', () => {
    expect(parsePageCursor(' eyJvZmZzZXQiOjIwfQ== ')).toEqual(ok('eyJvZmZzZXQiOjIwfQ=='));
  });

  it.each(['\ud800', 'a\udc00b', 'abc\ud83d'])('rejects the ill-formed cursor %j', (raw) => {
    expect(parsePageCursor(raw)).toEqual(
      err(validationError(VALIDATION_FIELD.PageCursor, VALIDATION_RULE.InvalidFormat)),
    );
  });

  it('keeps a cursor with a character outside the basic plane', () => {
    expect(parsePageCursor('a\u{1F600}')).toEqual(ok('a\u{1F600}'));
  });

  it('rejects a blank cursor and one that is too long', () => {
    expect(parsePageCursor('')).toEqual(
      err(validationError(VALIDATION_FIELD.PageCursor, VALIDATION_RULE.Required)),
    );
    expect(parsePageCursor('a'.repeat(513))).toEqual(
      err(validationError(VALIDATION_FIELD.PageCursor, VALIDATION_RULE.TooLong)),
    );
  });
});

describe('createPageRequest', () => {
  const cursor = unwrap(parsePageCursor('next'));

  it('asks for the first page with the default limit when given nothing', () => {
    expect(createPageRequest()).toEqual(ok({ limit: DEFAULT_PAGE_LIMIT }));
    expect(createPageRequest({})).toEqual(ok({ limit: DEFAULT_PAGE_LIMIT }));
  });

  it('keeps the cursor and the limit it is given', () => {
    expect(createPageRequest({ cursor, limit: 10 })).toEqual(ok({ cursor, limit: 10 }));
  });

  it('has no cursor key on the first page', () => {
    expect(unwrap(createPageRequest({ limit: 10 }))).not.toHaveProperty('cursor');
  });

  it('bounds the limit between 1 and the maximum', () => {
    expect(createPageRequest({ limit: 1 })).toEqual(ok({ limit: 1 }));
    expect(createPageRequest({ limit: MAX_PAGE_LIMIT })).toEqual(ok({ limit: MAX_PAGE_LIMIT }));
    const outOfRange = err(validationError(VALIDATION_FIELD.PageLimit, VALIDATION_RULE.OutOfRange));
    expect(createPageRequest({ limit: 0 })).toEqual(outOfRange);
    expect(createPageRequest({ limit: MAX_PAGE_LIMIT + 1 })).toEqual(outOfRange);
  });

  it('rejects a limit that is not an integer', () => {
    expect(createPageRequest({ limit: 2.5 })).toEqual(
      err(validationError(VALIDATION_FIELD.PageLimit, VALIDATION_RULE.NotAnInteger)),
    );
  });
});

describe('createPage', () => {
  it('holds a copy of the items and the next cursor', () => {
    const items = ['a', 'b'];
    const cursor = unwrap(parsePageCursor('next'));
    const page = createPage(items, cursor);
    items.push('c');

    expect(page).toEqual({ items: ['a', 'b'], nextCursor: cursor });
  });

  it('has no next cursor on the last page', () => {
    expect(createPage(['a'])).toEqual({ items: ['a'] });
    expect(createPage(['a'])).not.toHaveProperty('nextCursor');
  });
});
