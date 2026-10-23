import {
  biometricCancelled,
  biometricNotEnrolled,
  biometricUnavailable,
} from '@core/domain/errors/BiometricError';
import { err, ok } from '@core/domain/shared/Result';

import { BIOMETRIC_REASON } from '../ports/BiometricGate';
import { FakeBiometricGate } from '../testing/FakeBiometricGate';

import { confirmWithBiometrics } from './confirmWithBiometrics';

describe('confirmWithBiometrics', () => {
  it('shows the prompt for the reason and succeeds when the user is recognised', async () => {
    const gate = new FakeBiometricGate();

    expect(await confirmWithBiometrics(gate, BIOMETRIC_REASON.ConfirmVote)).toEqual(ok(undefined));
    expect(gate.prompts).toEqual([BIOMETRIC_REASON.ConfirmVote]);
  });

  it.each([biometricUnavailable(), biometricNotEnrolled()])(
    'reports %p without showing any prompt',
    async (error) => {
      const gate = new FakeBiometricGate();
      gate.availability = err(error);

      expect(await confirmWithBiometrics(gate, BIOMETRIC_REASON.UnlockApp)).toEqual(err(error));
      expect(gate.prompts).toEqual([]);
    },
  );

  it('returns the error of the authentication', async () => {
    const gate = new FakeBiometricGate();
    gate.authentication = err(biometricCancelled());

    expect(await confirmWithBiometrics(gate, BIOMETRIC_REASON.UnlockApp)).toEqual(
      err(biometricCancelled()),
    );
  });
});
