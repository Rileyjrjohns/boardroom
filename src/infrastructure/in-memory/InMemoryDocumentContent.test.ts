import { aDocumentLocation } from '@domain/testing/builders';

import { InMemoryDocumentContent } from './InMemoryDocumentContent';

const FIRST = aDocumentLocation('memory://documents/first');
const SECOND = aDocumentLocation('memory://documents/second');

describe('InMemoryDocumentContent', () => {
  it('knows the locations that hold content, and only those', () => {
    const content = new InMemoryDocumentContent();

    content.store(FIRST);

    expect(content.has(FIRST)).toBe(true);
    expect(content.has(SECOND)).toBe(false);
  });

  it('forgets a deleted location, and deleting what is not there changes nothing', () => {
    const content = new InMemoryDocumentContent();
    content.store(FIRST);
    content.store(SECOND);

    content.delete(FIRST);
    content.delete(FIRST);

    expect(content.has(FIRST)).toBe(false);
    expect(content.has(SECOND)).toBe(true);
  });

  it('stores a location again without harm', () => {
    const content = new InMemoryDocumentContent();

    content.store(FIRST);
    content.store(FIRST);
    content.delete(FIRST);

    expect(content.has(FIRST)).toBe(false);
  });
});
