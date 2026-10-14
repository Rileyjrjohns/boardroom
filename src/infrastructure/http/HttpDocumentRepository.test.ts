import { MONITORING_EVENT } from '@application/ports/Monitoring';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { aDocument, aDuration, aMeeting, aUserId } from '@domain/testing/builders';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';

import { documentFileName } from '../documents/storeDocumentContent';
import { createDocumentPdf } from '../pdf/createDocumentPdf';
import { createHttpWorld, installMockApi, TEST_API_URL } from '../testing/httpWorld';
import type { HttpWorld, HttpWorldOptions } from '../testing/httpWorld';
import { aDocumentDevice } from '../testing/documentDevice';
import { readStoredFile } from '../testing/NodeFileVolume';
import { temporaryDirectory } from '../testing/NodeSqlite';

import { HTTP_HEADER, HTTP_STATUS, MAX_DOCUMENT_BYTES } from './protocol';

// The download of a document, end to end: the real repository, the real client, the real `fetch` of
// Node through MSW, and the real files of a directory of the machine. The server is the API of the
// simulated server (`MockApi`) except where a test makes it send what a broken or hostile server
// would. The contract suite of the repository is run by HttpRepositories.test.ts.

const installed = installMockApi();
const filesParent = temporaryDirectory();

const DOCUMENT = aDocument({ title: 'Financial statements', pageCount: 3 });
const PDF = createDocumentPdf(DOCUMENT);
const PDF_HEADERS = {
  [HTTP_HEADER.ContentType]: 'application/pdf',
  [HTTP_HEADER.ETag]: '"v1"',
};
const USER = aUserId('user-1');

async function aWorld(options: HttpWorldOptions = {}): Promise<HttpWorld> {
  const world = await createHttpWorld(installed, options);
  world.load({ meetings: [aMeeting({ documents: [DOCUMENT] })], recordedVotes: [] });
  await world.signInAs(USER);
  return world;
}

/** The names of the files of the device, or a marker when they cannot be listed. */
async function filesOf(world: HttpWorld): Promise<readonly string[]> {
  const listed = await world.files.list();
  return listed.ok ? listed.value : ['the files could not be listed'];
}

/** Makes the server answer with `body`, whatever the request. */
function serverSends(
  body: ConstructorParameters<typeof Response>[0],
  init: ResponseInit = { status: HTTP_STATUS.Ok, headers: PDF_HEADERS },
): void {
  installed.override = () => new Response(body, init);
}

/** A stream of `size` bytes in chunks, with no length declared: a body that does not say how long it is. */
function streamOf(size: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const chunk = new Uint8Array(Math.min(500, size - sent)).fill(0x41);
      chunk.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
}

describe('HttpDocumentRepository, downloading the content', () => {
  describe('a PDF', () => {
    it('is written whole to a file of the device, and the repository says where it is', async () => {
      const world = await aWorld();

      const location = await world.documents.fetchContent(DOCUMENT.id);

      expect(location.ok).toBe(true);
      const where = location.ok ? location.value : ('' as DocumentLocation);
      expect(Array.from(readStoredFile(where))).toEqual(Array.from(PDF));
      expect(await world.files.stat(world.files.nameOf(where) ?? '')).toEqual({
        ok: true,
        value: { size: PDF.byteLength },
      });
    });

    it('is named for the user the token belongs to, the document and the version, and for nothing else', async () => {
      const world = await aWorld();
      serverSends(PDF, { status: HTTP_STATUS.Ok, headers: PDF_HEADERS });

      const location = await world.documents.fetchContent(DOCUMENT.id);

      const name = documentFileName(USER, DOCUMENT.id, '"v1"');
      expect(location).toEqual({ ok: true, value: world.files.uriOf(name) });
      expect(name).toMatch(/^[0-9a-f]{64}\.pdf$/);
      expect(name).not.toContain(DOCUMENT.id);
    });

    it('asks for a PDF, with the token of the user read when the request was created, and keeps nothing', async () => {
      const world = await aWorld();

      await world.documents.fetchContent(DOCUMENT.id);

      const headers = installed.receivedHeaders.at(-1);
      expect(installed.received.at(-1)).toBe(
        `GET ${TEST_API_URL}/documents/${DOCUMENT.id}/content`,
      );
      expect(headers?.get(HTTP_HEADER.Accept)).toBe('application/pdf');
      expect(headers?.get(HTTP_HEADER.CacheControl)).toBe('no-store');
      expect(headers?.get(HTTP_HEADER.Authorization)).toMatch(/^Bearer token-\d+$/);
    });

    it('accepts the media type with parameters and in any case', async () => {
      const world = await aWorld();
      serverSends(PDF, {
        status: HTTP_STATUS.Ok,
        headers: { ...PDF_HEADERS, [HTTP_HEADER.ContentType]: 'Application/PDF; charset=binary' },
      });

      expect((await world.documents.fetchContent(DOCUMENT.id)).ok).toBe(true);
    });

    it('replaces the file when the same version is downloaded again, at the same place', async () => {
      const world = await aWorld();

      const first = await world.documents.fetchContent(DOCUMENT.id);
      const second = await world.documents.fetchContent(DOCUMENT.id);

      expect(second).toEqual(first);
      expect(await filesOf(world)).toHaveLength(1);
    });

    it('is another file for another version, and for another user', async () => {
      const world = await aWorld();
      const first = await world.documents.fetchContent(DOCUMENT.id);

      world.load({ meetings: [aMeeting({ documents: [DOCUMENT] })], recordedVotes: [] });
      const newer = await world.documents.fetchContent(DOCUMENT.id);
      await world.signInAs(aUserId('user-2'));
      const other = await world.documents.fetchContent(DOCUMENT.id);

      const locations = [first, newer, other].map((result) => result.ok && result.value);
      expect(locations.every((location) => typeof location === 'string')).toBe(true);
      expect(new Set(locations).size).toBe(3);
    });
  });

  describe('what is not a PDF', () => {
    it.each([
      ['an HTML page', 'text/html; charset=utf-8'],
      ['JSON', 'application/json'],
      ['a stream of bytes', 'application/octet-stream'],
      ['nothing said', ''],
    ])(
      'is refused when the server sends %s, before it is read, and nothing is stored',
      async (_name, type) => {
        const world = await aWorld();
        serverSends(PDF, {
          status: HTTP_STATUS.Ok,
          headers: { ...PDF_HEADERS, ...(type === '' ? {} : { [HTTP_HEADER.ContentType]: type }) },
        });
        // A body is given a type by the platform when none is said: this one says none.
        if (type === '')
          installed.override = () =>
            new Response(PDF, {
              headers: { [HTTP_HEADER.ETag]: '"v1"', [HTTP_HEADER.ContentType]: '' },
            });

        const refused = await world.documents.fetchContent(DOCUMENT.id);

        expect(refused).toEqual({
          ok: false,
          error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'unexpected media type' },
        });
        expect(await filesOf(world)).toEqual([]);
      },
    );

    it('is refused when the bytes do not start with the signature of a PDF, though the server says they do', async () => {
      const world = await aWorld();
      serverSends('<html><body>Please sign in</body></html>');

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'invalid response' },
      });
      expect(world.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.ResponseInvalid]);
      expect(world.monitoring.errors[0]?.attributes).toEqual({
        resource: 'documentContent',
        reason: 'wrongSignature',
      });
      expect(await filesOf(world)).toEqual([]);
    });

    it('is refused when the body is empty', async () => {
      const world = await aWorld();
      serverSends(new Uint8Array(0));

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(!refused.ok && refused.error.code).toBe(REPOSITORY_ERROR_CODE.Unexpected);
      expect(await filesOf(world)).toEqual([]);
    });

    it.each([
      ['no version', undefined],
      ['an empty version', ''],
      ['a version with a space', 'has a space'],
      ['a version that is too long', 'v'.repeat(257)],
    ])('is refused with %s, and nothing is stored', async (_name, etag) => {
      const world = await aWorld();
      serverSends(PDF, {
        status: HTTP_STATUS.Ok,
        headers: {
          [HTTP_HEADER.ContentType]: 'application/pdf',
          ...(etag === undefined ? {} : { [HTTP_HEADER.ETag]: etag }),
        },
      });

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'invalid response' },
      });
      expect(world.monitoring.errors.at(-1)?.attributes).toMatchObject({ reason: 'noVersion' });
      expect(await filesOf(world)).toEqual([]);
    });
  });

  describe('a file that is too big', () => {
    const SMALL = { documents: { maxContentBytes: 2000 } } as const;

    it('is refused, unread, when the server declares more than the maximum', async () => {
      const world = await aWorld(SMALL);
      serverSends(PDF, {
        status: HTTP_STATUS.Ok,
        headers: { ...PDF_HEADERS, [HTTP_HEADER.ContentLength]: '2001' },
      });

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' },
      });
      expect(await filesOf(world)).toEqual([]);
    });

    it('is refused when a body that says nothing about its length grows past the maximum', async () => {
      const world = await aWorld(SMALL);
      serverSends(streamOf(5000));

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' },
      });
      expect(await filesOf(world)).toEqual([]);
    });

    it('is accepted when it is exactly the maximum', async () => {
      const world = await aWorld(SMALL);
      serverSends(streamOf(2000));

      expect((await world.documents.fetchContent(DOCUMENT.id)).ok).toBe(true);
    });

    it('has a maximum of its own that is above the one of the JSON answers', () => {
      expect(MAX_DOCUMENT_BYTES).toBeGreaterThan(2 * 1024 * 1024);
    });
  });

  describe('time', () => {
    it('is bounded: a server that takes too long is a network that failed, and nothing is stored', async () => {
      const world = await aWorld({ documents: { downloadTimeout: aDuration(50) } });
      installed.conditions.delayMillis = 400;

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.NetworkUnavailable },
      });
      expect(await filesOf(world)).toEqual([]);
    });

    it('is bounded when the body never ends, too', async () => {
      const world = await aWorld({ documents: { downloadTimeout: aDuration(80) } });
      serverSends(new ReadableStream({ start: () => undefined }));

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.NetworkUnavailable },
      });
    });

    it('gets more time than a request of JSON when the download has a timeout of its own', async () => {
      const world = await aWorld({
        client: { timeout: aDuration(50) },
        documents: { downloadTimeout: aDuration(2000) },
      });
      installed.conditions.delayMillis = 200;

      expect((await world.documents.fetchContent(DOCUMENT.id)).ok).toBe(true);
    });
  });

  describe('a server that refuses', () => {
    it.each([
      [HTTP_STATUS.Unauthorized, { code: REPOSITORY_ERROR_CODE.Unauthorized }],
      [HTTP_STATUS.Forbidden, { code: REPOSITORY_ERROR_CODE.Forbidden }],
      [HTTP_STATUS.NotFound, { code: REPOSITORY_ERROR_CODE.NotFound }],
      [HTTP_STATUS.ServiceUnavailable, { code: REPOSITORY_ERROR_CODE.NetworkUnavailable }],
      [HTTP_STATUS.TooManyRequests, { code: REPOSITORY_ERROR_CODE.NetworkUnavailable }],
      [
        HTTP_STATUS.InternalServerError,
        { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 500' },
      ],
      [
        HTTP_STATUS.UnprocessableContent,
        { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 422' },
      ],
    ])('answers the error of the status %i, and stores nothing', async (status, error) => {
      const world = await aWorld();
      serverSends('{"error":{"code":"nope"}}', {
        status,
        headers: { [HTTP_HEADER.ContentType]: 'application/json' },
      });

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({ ok: false, error });
      expect(await filesOf(world)).toEqual([]);
    });

    it('answers unauthorized when the API does not know the token, forbidden for a document the user may not have, and notFound for one that is not there', async () => {
      const world = await aWorld();

      world.load({ meetings: [], recordedVotes: [] });
      expect(await world.documents.fetchContent(DOCUMENT.id)).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.NotFound },
      });

      world.load({
        meetings: [aMeeting({ documents: [DOCUMENT], participants: [] })],
        recordedVotes: [],
      });
      expect(await world.documents.fetchContent(DOCUMENT.id)).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Forbidden },
      });

      world.api.revokeSessions();
      expect(await world.documents.fetchContent(DOCUMENT.id)).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unauthorized },
      });
    });

    it('does not send the request, and answers unauthorized, when nobody is signed in', async () => {
      const world = await aWorld();
      await world.auth.signOut();
      installed.received.length = 0;

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({ ok: false, error: { code: REPOSITORY_ERROR_CODE.Unauthorized } });
      expect(installed.received).toEqual([]);
    });
  });

  describe('a device that cannot keep the file', () => {
    it('answers unexpected with a cause that says nothing of the file, and tells the monitoring with the code only', async () => {
      const device = aDocumentDevice(filesParent);
      const world = await aWorld({ files: device.store });
      device.volume.fail('write', true);

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'content not stored' },
      });
      expect(world.monitoring.capturedEvents()).toEqual([
        MONITORING_EVENT.DocumentContentNotStored,
      ]);
      expect(world.monitoring.errors[0]).toMatchObject({
        error: { code: 'storageWriteFailed', cause: 'EIO' },
        attributes: { resource: 'documentContent', documentId: DOCUMENT.id },
      });
      expect(await filesOf(world)).toEqual([]);
    });

    it('leaves the previous file as it was when the new one cannot be put in its place', async () => {
      const device = aDocumentDevice(filesParent, { realLocations: true });
      const world = await aWorld({ files: device.store });
      const first = await world.documents.fetchContent(DOCUMENT.id);
      device.volume.fail('move', true);

      const refused = await world.documents.fetchContent(DOCUMENT.id);

      expect(refused.ok).toBe(false);
      expect(await filesOf(world)).toHaveLength(1);
      expect(first.ok && Array.from(readStoredFile(first.value))).toEqual(Array.from(PDF));
    });
  });

  describe('what the errors and the logs hold', () => {
    it('is never an address, a path, a name, the token or the title', async () => {
      const world = await aWorld({ documents: { maxContentBytes: 100 } });
      const tooBig = await world.documents.fetchContent(DOCUMENT.id);
      serverSends('<html>');
      const notAPdf = await world.documents.fetchContent(DOCUMENT.id);

      const everything = JSON.stringify([
        tooBig,
        notAPdf,
        world.monitoring.errors,
        world.monitoring.logs,
      ]);

      expect(everything).not.toContain(TEST_API_URL);
      expect(everything).not.toContain('api.boardroom');
      expect(everything).not.toContain(DOCUMENT.title);
      expect(everything).not.toMatch(/token-\d|Bearer|file:\/\/|\.pdf/);
    });
  });
});
