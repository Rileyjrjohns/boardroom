import { screenProtectionFailed } from '@domain/errors/ScreenProtectionError';
import { err, ok } from '@domain/shared/Result';
import { aConfidentialDocument, aDocumentId, aDocumentLocation } from '@domain/testing/builders';

import { createFakes } from '../../testing/createFakes';

import { CloseDocument } from './CloseDocument';
import { OpenDocument } from './OpenDocument';

const A = aConfidentialDocument({ id: aDocumentId('document-A') });
const B = aConfidentialDocument({ id: aDocumentId('document-B') });

function setup() {
  const fakes = createFakes();
  fakes.documents.addDocument(A, aDocumentLocation('file:///private/a.pdf'));
  fakes.documents.addDocument(B, aDocumentLocation('file:///private/b.pdf'));
  return { fakes, open: new OpenDocument(fakes), close: new CloseDocument(fakes) };
}

describe('CloseDocument', () => {
  it('turns the screen protection off when the document was the only one open', async () => {
    const { fakes, open, close } = setup();
    await open.execute({ documentId: A.id });

    expect(await close.execute({ documentId: A.id })).toEqual(ok(undefined));
    expect(fakes.screenProtection.enabled).toBe(false);
  });

  it('keeps the screen protected while another confidential document is still open', async () => {
    const { fakes, open, close } = setup();
    await open.execute({ documentId: A.id });
    await open.execute({ documentId: B.id });

    await close.execute({ documentId: B.id });
    expect(fakes.screenProtection.enabled).toBe(true);

    await close.execute({ documentId: A.id });
    expect(fakes.screenProtection.enabled).toBe(false);
  });

  it('ignores a document that is not open: the protection is left as it is', async () => {
    const { fakes, open, close } = setup();
    await open.execute({ documentId: A.id });

    expect(await close.execute({ documentId: B.id })).toEqual(ok(undefined));
    expect(fakes.screenProtection.enabled).toBe(true);
    expect(fakes.screenProtection.disableCalls).toBe(0);
  });

  it('succeeds when nothing is open', async () => {
    const { fakes, close } = setup();

    expect(await close.execute({ documentId: A.id })).toEqual(ok(undefined));
    expect(fakes.screenProtection.disableCalls).toBe(0);
  });

  it('returns the failure of the protection, and a second call retries', async () => {
    const { fakes, open, close } = setup();
    await open.execute({ documentId: A.id });
    fakes.screenProtection.disableFailure = screenProtectionFailed();

    expect(await close.execute({ documentId: A.id })).toEqual(err(screenProtectionFailed()));

    fakes.screenProtection.disableFailure = undefined;
    expect(await close.execute({ documentId: A.id })).toEqual(ok(undefined));
    expect(fakes.screenProtection.enabled).toBe(false);
  });
});
