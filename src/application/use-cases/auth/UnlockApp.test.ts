import { biometricCancelled, biometricUnavailable } from '@domain/errors/BiometricError';
import { err, ok } from '@domain/shared/Result';

import { BIOMETRIC_REASON } from '../../ports/BiometricGate';
import { createFakes } from '../../testing/createFakes';

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
});
