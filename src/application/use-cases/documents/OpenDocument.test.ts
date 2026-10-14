import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
} from '@domain/errors/RepositoryError';
import {
  screenProtectionFailed,
  screenProtectionUnsupported,
} from '@domain/errors/ScreenProtectionError';
import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { err, isErr, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_DAY,
  NOW,
  aConfidentialDocument,
  aDocument,
  aDocumentId,
  aDocumentLocation,
  aSession,
  aUser,
  aUserId,
  anEmail,
  at,
} from '@domain/testing/builders';

import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { FRESHNESS } from '../../shared/Loaded';
import { CACHE_RESOURCE } from '../../shared/CacheResource';
import { createFakes } from '../../testing/createFakes';
import { SignOut } from '../auth/SignOut';

import { CloseDocument } from './CloseDocument';
import { OpenDocument } from './OpenDocument';

const CONFIDENTIAL = aConfidentialDocument();
const INTERNAL = aDocument({
  id: aDocumentId('document-2'),
  confidentiality: CONFIDENTIALITY_LEVEL.Internal,
});
const LOCATION = aDocumentLocation('file:///private/document-1.pdf');
const DOCUMENT_ATTRIBUTES = {
  [LOG_ATTRIBUTE.DocumentId]: aDocumentId(),
  [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Document,
};
const OTHER_LOCATION = aDocumentLocation('file:///private/document-2.pdf');

function setup() {
  const fakes = createFakes();
  fakes.documents.addDocument(CONFIDENTIAL, LOCATION);
  fakes.documents.addDocument(INTERNAL, OTHER_LOCATION);
  return { fakes, useCase: new OpenDocument(fakes) };
}

describe('OpenDocument', () => {
  describe('a user who is not the one who viewed the document', () => {
    it('finds nothing of it offline: A views a confidential document, B signs in on the device', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      await fakes.screenProtection.disable();
      fakes.auth.session = aSession({
        user: aUser({ id: aUserId('user-B'), email: anEmail('b@example.com') }),
      });
      fakes.network.goOffline();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(networkUnavailable()),
      );
      expect(fakes.screenProtection.enabled).toBe(false);
    });

    it('finds nothing of it after the sign-out of A either: the cache was emptied', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      await new SignOut(fakes).execute();
      fakes.auth.session = aSession();
      fakes.appLock.unlock();
      fakes.network.goOffline();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(networkUnavailable()),
      );
      expect(fakes.documentCache.isEmpty()).toBe(true);
    });
  });

  describe('a confidential document', () => {
    it('turns the screen protection on before returning the document', async () => {
      const { fakes, useCase } = setup();

      const result = await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(result).toEqual(
        ok({
          document: CONFIDENTIAL,
          location: LOCATION,
          watermark: { fullName: aUser().fullName, email: aUser().email, viewedAt: NOW },
          source: { freshness: FRESHNESS.Fresh },
          screenProtected: true,
        }),
      );
      expect(fakes.screenProtection.enabled).toBe(true);
    });

    it('fails closed: without protection, the document is not returned', async () => {
      const { fakes, useCase } = setup();
      fakes.screenProtection.enableFailure = screenProtectionUnsupported();

      const result = await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(result).toEqual(err(screenProtectionUnsupported()));
      expect(fakes.screenProtection.enabled).toBe(false);
      expect(fakes.monitoring.loggedEvents()).not.toContain(MONITORING_EVENT.DocumentOpened);
    });

    it('reports a protection that failed to start', async () => {
      const { fakes, useCase } = setup();
      fakes.screenProtection.enableFailure = screenProtectionFailed();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(screenProtectionFailed()),
      );
    });
  });

  describe('several confidential documents', () => {
    const SECOND = aConfidentialDocument({ id: aDocumentId('document-3') });

    it('keeps the screen protected until the last one is closed', async () => {
      const { fakes, useCase } = setup();
      fakes.documents.addDocument(SECOND, aDocumentLocation('file:///private/document-3.pdf'));
      const close = new CloseDocument(fakes);
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      await useCase.execute({ documentId: SECOND.id });

      await close.execute({ documentId: SECOND.id });
      expect(fakes.screenProtection.enabled).toBe(true);

      await close.execute({ documentId: CONFIDENTIAL.id });
      expect(fakes.screenProtection.enabled).toBe(false);
    });

    it('does not register a document that could not be protected', async () => {
      const { fakes, useCase } = setup();
      fakes.documents.addDocument(SECOND, aDocumentLocation('file:///private/document-3.pdf'));
      fakes.screenProtection.enableFailure = screenProtectionFailed();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      fakes.screenProtection.enableFailure = undefined;
      await useCase.execute({ documentId: SECOND.id });

      await new CloseDocument(fakes).execute({ documentId: SECOND.id });

      expect(fakes.screenProtection.enabled).toBe(false);
    });
  });

  describe('a document that is not confidential', () => {
    it('is shown without turning the protection on', async () => {
      const { fakes, useCase } = setup();

      const result = await useCase.execute({ documentId: INTERNAL.id });

      expect(result.ok && result.value.screenProtected).toBe(false);
      expect(fakes.screenProtection.enableCalls).toBe(0);
    });

    it('is not blocked by a platform that cannot protect the screen', async () => {
      const { fakes, useCase } = setup();
      fakes.screenProtection.enableFailure = screenProtectionUnsupported();

      const result = await useCase.execute({ documentId: INTERNAL.id });

      expect(result.ok && result.value.document).toEqual(INTERNAL);
      expect(result.ok && result.value.screenProtected).toBe(false);
    });
  });

  describe('the watermark', () => {
    it('is built from the signed-in user and the instant of the clock', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({
        user: aUser({ fullName: 'Bruno Durand' }),
      });
      fakes.clock.set(at(5000));

      const result = await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(result.ok && result.value.watermark).toEqual({
        fullName: 'Bruno Durand',
        email: aUser().email,
        viewedAt: at(5000),
      });
    });
  });

  describe('the session', () => {
    it('is required', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = undefined;

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(notAuthenticated()),
      );
      expect(fakes.documents.getCalls).toEqual([]);
      expect(fakes.screenProtection.enableCalls).toBe(0);
    });

    it('must not have expired', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ expiresAt: NOW });

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(err(sessionExpired()));
      expect(fakes.documents.getCalls).toEqual([]);
    });
  });

  describe('the access log', () => {
    it('records who opened which document, with identifiers only', async () => {
      const { fakes, useCase } = setup();

      await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Info,
          event: MONITORING_EVENT.DocumentOpened,
          attributes: {
            [LOG_ATTRIBUTE.DocumentId]: CONFIDENTIAL.id,
            [LOG_ATTRIBUTE.UserId]: aUser().id,
            [LOG_ATTRIBUTE.Confidentiality]: CONFIDENTIALITY_LEVEL.Confidential,
            [LOG_ATTRIBUTE.Freshness]: FRESHNESS.Fresh,
          },
        },
      ]);
      const serialised = JSON.stringify(fakes.monitoring.logs);
      expect(serialised).not.toContain(aUser().fullName);
      expect(serialised).not.toContain(aUser().email);
    });
  });

  describe('the offline policy', () => {
    it('caches the metadata and the location of a document it opened', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(await fakes.documentCache.read(aUserId(), CONFIDENTIAL.id)).toEqual(
        ok({ value: { document: CONFIDENTIAL, location: LOCATION }, cachedAt: NOW }),
      );
    });

    it('opens a document already viewed without network, flagged stale, still protected', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      await fakes.screenProtection.disable();
      fakes.network.goOffline();
      fakes.clock.advance(1_800_000);

      const result = await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(result.ok && result.value.source).toEqual({
        freshness: FRESHNESS.Stale,
        cachedAt: NOW,
      });
      expect(result.ok && result.value.location).toBe(LOCATION);
      expect(result.ok && result.value.watermark.viewedAt).toBe(at(1_800_000));
      expect(fakes.screenProtection.enabled).toBe(true);
    });

    it('returns the network error for a document never viewed', async () => {
      const { fakes, useCase } = setup();
      fakes.network.goOffline();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(networkUnavailable()),
      );
      expect(fakes.screenProtection.enableCalls).toBe(0);
    });

    it('does not cache, nor protect, nor return a document whose content could not be fetched', async () => {
      const { fakes, useCase } = setup();
      fakes.documents.contentFailure = unauthorized();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(err(unauthorized()));
      expect(fakes.documents.getCalls).toEqual([CONFIDENTIAL.id]);
      expect(await fakes.documentCache.read(aUserId(), CONFIDENTIAL.id)).toEqual(ok(undefined));
      expect(fakes.screenProtection.enableCalls).toBe(0);
    });

    it('returns notFound for an unknown document', async () => {
      const { fakes, useCase } = setup();

      expect(await useCase.execute({ documentId: aDocumentId('unknown') })).toEqual(
        err(notFound()),
      );
      expect(fakes.documents.fetchContentCalls).toEqual([]);
    });

    it('fetches the content only after the metadata is known', async () => {
      const { fakes, useCase } = setup();

      await useCase.execute({ documentId: CONFIDENTIAL.id });
      await useCase.execute({ documentId: aDocumentId('unknown') });

      expect(fakes.documents.getCalls).toEqual([CONFIDENTIAL.id, aDocumentId('unknown')]);
      expect(fakes.documents.fetchContentCalls).toEqual([CONFIDENTIAL.id]);
    });

    it('evicts the cached copy when the server refuses, and never serves it afterwards', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      await fakes.screenProtection.disable();
      fakes.documents.failure = unauthorized();

      const result = await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(result).toEqual(err(unauthorized()));
      expect(isErr(result)).toBe(true);
      expect(fakes.screenProtection.enabled).toBe(false);
      expect(await fakes.documentCache.read(aUserId(), CONFIDENTIAL.id)).toEqual(ok(undefined));

      fakes.documents.failure = undefined;
      // The refused session is over: the user signs in again, and finds no saved copy.
      fakes.auth.session = aSession();
      fakes.appLock.unlock();
      fakes.network.goOffline();
      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(networkUnavailable()),
      );
    });

    it('evicts the cached copy of a document that no longer exists', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      fakes.documents.failure = notFound();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(err(notFound()));
      expect(await fakes.documentCache.read(aUserId(), CONFIDENTIAL.id)).toEqual(ok(undefined));
    });

    it('refuses a cached copy older than the maximum age', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ expiresAt: at(30 * MILLIS_PER_DAY) });
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      fakes.network.goOffline();

      fakes.clock.advance(7 * MILLIS_PER_DAY);
      const atTheLimit = await useCase.execute({ documentId: CONFIDENTIAL.id });
      expect(atTheLimit.ok && atTheLimit.value.source).toEqual({
        freshness: FRESHNESS.Stale,
        cachedAt: NOW,
      });
      fakes.clock.advance(1);
      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(networkUnavailable()),
      );
    });

    it('opens the document when the cache cannot be written, and captures the failure', async () => {
      const { fakes, useCase } = setup();
      fakes.documentCache.writeFailure = storageWriteFailed();

      const result = await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(result.ok && result.value).toMatchObject({
        document: CONFIDENTIAL,
        location: LOCATION,
        source: { freshness: FRESHNESS.Fresh },
      });
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheWriteFailed,
          error: storageWriteFailed(),
          attributes: DOCUMENT_ATTRIBUTES,
        },
      ]);
    });

    it('returns the network error, and captures the failure, when the cache cannot be read either', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      await fakes.screenProtection.disable();
      fakes.network.goOffline();
      fakes.documentCache.readFailure = storageReadFailed();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(
        err(networkUnavailable()),
      );
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheReadFailed,
          error: storageReadFailed(),
          attributes: DOCUMENT_ATTRIBUTES,
        },
      ]);
      expect(fakes.screenProtection.enableCalls).toBe(1);
      expect(fakes.screenProtection.enabled).toBe(false);
    });

    it('captures an eviction that failed, empties the caches, and still returns the refusal', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      fakes.documents.forbid(CONFIDENTIAL.id);
      fakes.documentCache.removeFailure = storageWriteFailed();

      expect(await useCase.execute({ documentId: CONFIDENTIAL.id })).toEqual(err(forbidden()));
      expect(fakes.documentCache.isEmpty()).toBe(true);
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheRemoveFailed,
          error: storageWriteFailed(),
          attributes: DOCUMENT_ATTRIBUTES,
        },
      ]);
    });

    it('logs that a cached document was served, with its id', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ documentId: CONFIDENTIAL.id });
      fakes.network.goOffline();
      fakes.monitoring.logs.length = 0;

      await useCase.execute({ documentId: CONFIDENTIAL.id });

      expect(fakes.monitoring.logs[0]).toEqual({
        level: LOG_LEVEL.Info,
        event: MONITORING_EVENT.ServedFromCache,
        attributes: DOCUMENT_ATTRIBUTES,
      });
    });
  });
});
