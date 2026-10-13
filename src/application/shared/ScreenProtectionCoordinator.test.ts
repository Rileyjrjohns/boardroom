import {
  screenProtectionFailed,
  screenProtectionUnsupported,
} from '@domain/errors/ScreenProtectionError';
import { err, ok } from '@domain/shared/Result';
import { aDocumentId } from '@domain/testing/builders';

import { FakeScreenProtection } from '../testing/FakeScreenProtection';

import { ScreenProtectionCoordinator } from './ScreenProtectionCoordinator';

const A = aDocumentId('document-A');
const B = aDocumentId('document-B');

function setup() {
  const screenProtection = new FakeScreenProtection();
  return { screenProtection, coordinator: new ScreenProtectionCoordinator({ screenProtection }) };
}

describe('ScreenProtectionCoordinator', () => {
  it('turns the protection on when a confidential document is opened', async () => {
    const { screenProtection, coordinator } = setup();

    expect(await coordinator.acquire(A)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(true);
  });

  it('turns the protection off when the only open document is closed', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);

    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(false);
  });

  it('keeps the protection on while another confidential document is still open', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(B);

    await coordinator.release(B);

    expect(screenProtection.enabled).toBe(true);
    expect(screenProtection.disableCalls).toBe(0);

    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(false);
    expect(screenProtection.disableCalls).toBe(1);
  });

  it('does not depend on the order in which the documents are closed', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(B);

    await coordinator.release(A);
    expect(screenProtection.enabled).toBe(true);
    await coordinator.release(B);

    expect(screenProtection.enabled).toBe(false);
  });

  it('ignores the closing of an unknown document: nothing is switched, it succeeds', async () => {
    const { screenProtection, coordinator } = setup();

    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.disableCalls).toBe(0);

    await coordinator.acquire(B);
    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(true);
  });

  it('ignores the closing of a document that is already closed', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(B);
    await coordinator.release(A);

    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(true);
    expect(screenProtection.disableCalls).toBe(0);
  });

  it('treats a document opened twice as one', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    await coordinator.acquire(A);

    await coordinator.release(A);

    expect(screenProtection.enabled).toBe(false);
  });

  it('does not register a document whose protection could not be turned on', async () => {
    const { screenProtection, coordinator } = setup();
    screenProtection.enableFailure = screenProtectionUnsupported();

    expect(await coordinator.acquire(A)).toEqual(err(screenProtectionUnsupported()));

    screenProtection.enableFailure = undefined;
    await coordinator.acquire(B);
    await coordinator.release(B);
    expect(screenProtection.enabled).toBe(false);
    // A was never registered: closing it again does not touch the protection.
    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.disableCalls).toBe(1);
  });

  it('keeps the document registered when the protection cannot be turned off, so that a retry works', async () => {
    const { screenProtection, coordinator } = setup();
    await coordinator.acquire(A);
    screenProtection.disableFailure = screenProtectionFailed();

    expect(await coordinator.release(A)).toEqual(err(screenProtectionFailed()));
    expect(screenProtection.enabled).toBe(true);

    screenProtection.disableFailure = undefined;
    expect(await coordinator.release(A)).toEqual(ok(undefined));
    expect(screenProtection.enabled).toBe(false);
  });

  it('keeps no memory of its own between two instances', async () => {
    const screenProtection = new FakeScreenProtection();
    const first = new ScreenProtectionCoordinator({ screenProtection });
    const second = new ScreenProtectionCoordinator({ screenProtection });
    await first.acquire(A);

    await second.release(A);

    expect(screenProtection.enabled).toBe(true);
  });
});
