import { ok } from '@domain/shared/Result';
import { aConfidentialDocument } from '@domain/testing/builders';
import type { DocumentId } from '@domain/value-objects/ids';
import type { DocumentRepository } from '@application/ports/DocumentRepository';
import { createFakes } from '@application/testing/createFakes';
import { SignOut } from '@application/use-cases/auth/SignOut';
import { OpenDocument } from '@application/use-cases/documents/OpenDocument';
import { storeDocumentContent } from '@infrastructure/documents/storeDocumentContent';
import { SqliteDocumentCache } from '@infrastructure/persistence/SqliteDocumentCache';
import { aDocumentDevice } from '@infrastructure/testing/documentDevice';
import { temporaryDirectory } from '@infrastructure/testing/NodeSqlite';
import { databaseDirectory, openTestDatabase } from '@infrastructure/testing/testDatabase';

// A download that is still running when the user signs out. The repository writes the file as soon
// as the bytes have arrived, the use case finds out afterwards that nobody is signed in, and no
// database row ever points at the file: the sweep of orphans only runs when the container starts,
// so the use case itself must leave nothing behind. Real cache (SQLite) and real files, on the
// drivers of Node.

const databases = databaseDirectory();
const filesParent = temporaryDirectory();

const PDF_BYTES = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);

describe('a document that finishes downloading after the user signed out', () => {
  it('leaves no file on the device', async () => {
    const fakes = createFakes();
    const test = await openTestDatabase(databases);
    const device = aDocumentDevice(filesParent, { realLocations: true });
    const documentCache = new SqliteDocumentCache({
      database: test.database,
      files: device.store,
      monitoring: fakes.monitoring,
    });
    const document = aConfidentialDocument();
    const session = await fakes.auth.current();
    if (!session.ok || session.value === undefined) throw new Error('Nobody is signed in.');
    const userId = session.value.user.id;

    let downloadStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      downloadStarted = resolve;
    });
    let finishDownload!: () => void;
    const downloadRunning = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    const documents: DocumentRepository = {
      get: () => Promise.resolve(ok(document)),
      fetchContent: async (documentId: DocumentId) => {
        downloadStarted();
        await downloadRunning;
        return storeDocumentContent(
          { files: device.store, monitoring: fakes.monitoring },
          { userId, documentId, version: 'v1', bytes: PDF_BYTES },
        );
      },
    };
    const deps = { ...fakes, documents, documentCache };

    const opening = new OpenDocument(deps).execute({ documentId: document.id });
    await started;
    await new SignOut(deps).execute();
    finishDownload();
    const opened = await opening;

    expect(opened.ok).toBe(false);
    expect(await device.store.list()).toEqual(ok([]));
  });
});
