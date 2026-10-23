import { storageReadFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';
import { NOW, aDuration, aSession, at } from '@testing/domain/builders';

import { EvaluateAppLock } from './EvaluateAppLock';

const GRACE_PERIOD = aDuration(30_000);

function setup() {
  const fakes = createFakes();
  const useCase = new EvaluateAppLock({ ...fakes, gracePeriod: GRACE_PERIOD });
  return { fakes, useCase };
}

describe('EvaluateAppLock', () => {
  it('does not require the unlock when the app returns within the grace period', async () => {
    const { fakes, useCase } = setup();
    fakes.clock.advance(29_999);

    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(ok(false));
  });

  it('requires the unlock once the grace period has elapsed', async () => {
    const { fakes, useCase } = setup();
    fakes.clock.advance(30_000);

    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(ok(true));
  });

  it('reads the time from the clock at the moment of the call', async () => {
    const { fakes, useCase } = setup();

    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(ok(false));
    fakes.clock.advance(60_000);
    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(ok(true));
  });

  it('has nothing to lock when nobody is signed in', async () => {
    const { fakes, useCase } = setup();
    fakes.auth.session = undefined;
    fakes.clock.advance(3_600_000);

    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(ok(false));
  });

  it('has nothing to lock when the session has expired', async () => {
    const { fakes, useCase } = setup();
    fakes.auth.session = aSession({ expiresAt: at(10_000) });
    fakes.clock.advance(3_600_000);

    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(ok(false));
  });

  it('requires the unlock when the clock has been set back', async () => {
    const { fakes, useCase } = setup();
    fakes.clock.set(at(-1000));

    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(ok(true));
  });

  it('returns the storage error when the session cannot be read', async () => {
    const { fakes, useCase } = setup();
    fakes.auth.readFailure = storageReadFailed();

    expect(await useCase.execute({ backgroundedAt: NOW })).toEqual(err(storageReadFailed()));
  });

  describe('the lock it enforces', () => {
    it('closes the AppLock when the unlock is required, so that nothing is served until it succeeds', async () => {
      const { fakes, useCase } = setup();
      fakes.clock.advance(30_000);

      await useCase.execute({ backgroundedAt: NOW });

      expect(fakes.appLock.isLocked()).toBe(true);
    });

    it('leaves the AppLock open when the app returns within the grace period', async () => {
      const { fakes, useCase } = setup();
      fakes.clock.advance(29_999);

      await useCase.execute({ backgroundedAt: NOW });

      expect(fakes.appLock.isLocked()).toBe(false);
    });

    it('closes the AppLock when the clock has been set back: the time away cannot be known', async () => {
      const { fakes, useCase } = setup();
      fakes.clock.set(at(-1000));

      await useCase.execute({ backgroundedAt: NOW });

      expect(fakes.appLock.isLocked()).toBe(true);
    });

    it('closes the AppLock when the session cannot be read: it fails closed', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.readFailure = storageReadFailed();

      await useCase.execute({ backgroundedAt: NOW });

      expect(fakes.appLock.isLocked()).toBe(true);
    });

    it('does not touch the AppLock when there is nothing to protect', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = undefined;
      fakes.clock.advance(3_600_000);

      await useCase.execute({ backgroundedAt: NOW });

      expect(fakes.appLock.isLocked()).toBe(false);
    });
  });
});
