import {
  biometricCancelled,
  biometricFailed,
  biometricUnavailable,
} from '@core/domain/errors/BiometricError';
import { err, ok } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';

import { BIOMETRIC_REASON } from '../ports/BiometricGate';

import { UnlockApp } from './UnlockApp';

describe('UnlockApp', () => {
  it('unlocks the app with a biometric proof for the unlock reason', async () => {
    const fakes = createFakes();

    expect(await new UnlockApp(fakes).execute()).toEqual(ok(undefined));
    expect(fakes.biometricGate.prompts).toEqual([BIOMETRIC_REASON.UnlockApp]);
  });

  it('returns the refusal of the user', async () => {
    const fakes = createFakes();
    fakes.biometricGate.authentication = err(biometricCancelled());

    expect(await new UnlockApp(fakes).execute()).toEqual(err(biometricCancelled()));
  });

  it('reports a device without biometrics before showing a prompt', async () => {
    const fakes = createFakes();
    fakes.biometricGate.availability = err(biometricUnavailable());

    expect(await new UnlockApp(fakes).execute()).toEqual(err(biometricUnavailable()));
    expect(fakes.biometricGate.prompts).toEqual([]);
  });

  describe('the lock it opens', () => {
    it('opens the AppLock when the biometrics succeed', async () => {
      const fakes = createFakes();
      fakes.appLock.lock();

      await new UnlockApp(fakes).execute();

      expect(fakes.appLock.isLocked()).toBe(false);
    });

    it.each([
      ['the user cancels', err(biometricCancelled())],
      ['the user is not recognised', err(biometricFailed())],
    ])('leaves the AppLock closed when %s', async (_name, refusal) => {
      const fakes = createFakes();
      fakes.appLock.lock();
      fakes.biometricGate.authentication = refusal;

      await new UnlockApp(fakes).execute();

      expect(fakes.appLock.isLocked()).toBe(true);
    });

    it('leaves the AppLock closed when the device has no biometrics', async () => {
      const fakes = createFakes();
      fakes.appLock.lock();
      fakes.biometricGate.availability = err(biometricUnavailable());

      await new UnlockApp(fakes).execute();

      expect(fakes.appLock.isLocked()).toBe(true);
    });
  });
});
