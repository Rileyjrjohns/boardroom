import {
  biometricCancelled,
  biometricNotEnrolled,
  biometricUnavailable,
} from '@core/domain/errors/BiometricError';
import { err, ok } from '@core/domain/shared/Result';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';

import { InMemoryBiometricGate } from './InMemoryBiometricGate';

describe('InMemoryBiometricGate', () => {
  it('is available and recognises the user, so that the demo runs on a simulator', async () => {
    const gate = new InMemoryBiometricGate();

    expect(await gate.checkAvailability()).toStrictEqual(ok(undefined));
    expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(ok(undefined));
  });

  it('remembers the reason of every prompt it showed, in order', async () => {
    const gate = new InMemoryBiometricGate();

    await gate.authenticate(BIOMETRIC_REASON.UnlockApp);
    await gate.authenticate(BIOMETRIC_REASON.ConfirmVote);

    expect(gate.prompts()).toEqual([BIOMETRIC_REASON.UnlockApp, BIOMETRIC_REASON.ConfirmVote]);
  });

  it('hands out a copy of the prompts it remembers', async () => {
    const gate = new InMemoryBiometricGate();
    await gate.authenticate(BIOMETRIC_REASON.UnlockApp);

    (gate.prompts() as string[]).length = 0;

    expect(gate.prompts()).toEqual([BIOMETRIC_REASON.UnlockApp]);
  });

  it('can be made unavailable, or made to refuse the user, for a test', async () => {
    const gate = new InMemoryBiometricGate();

    gate.setAvailability(err(biometricNotEnrolled()));
    expect(await gate.checkAvailability()).toStrictEqual(err(biometricNotEnrolled()));
    gate.setAvailability(err(biometricUnavailable()));
    expect(await gate.checkAvailability()).toStrictEqual(err(biometricUnavailable()));

    gate.setAuthentication(err(biometricCancelled()));
    expect(await gate.authenticate(BIOMETRIC_REASON.ConfirmVote)).toStrictEqual(
      err(biometricCancelled()),
    );
  });
});
