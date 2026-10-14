import type { LocalAuthenticationError } from 'expo-local-authentication';

import { BIOMETRIC_ERROR_CODE } from '@domain/errors/BiometricError';
import { err, ok } from '@domain/shared/Result';
import { BIOMETRIC_REASON } from '@application/ports/BiometricGate';
import { MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import type { BiometricReason } from '@application/ports/BiometricGate';

import { DeviceBiometricGate } from './DeviceBiometricGate';
import type { LocalAuthenticationApi } from './DeviceBiometricGate';

/** A platform whose answers the test sets, and that remembers what it was asked. */
class ScriptedPlatform implements LocalAuthenticationApi {
  hardware: boolean | Error | 'never' = true;
  enrolled: boolean | Error | 'never' = true;
  outcome: Awaited<ReturnType<LocalAuthenticationApi['authenticate']>> | Error = { success: true };
  readonly prompts: Parameters<LocalAuthenticationApi['authenticate']>[0][] = [];

  hasHardware(): Promise<boolean> {
    return answer(this.hardware);
  }

  isEnrolled(): Promise<boolean> {
    return answer(this.enrolled);
  }

  authenticate(options: Parameters<LocalAuthenticationApi['authenticate']>[0]) {
    this.prompts.push(options);
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

function answer(value: boolean | Error | 'never'): Promise<boolean> {
  if (value === 'never') return new Promise(() => undefined);
  return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
}

const TEXTS: Record<BiometricReason, string> = {
  [BIOMETRIC_REASON.UnlockApp]: 'Unlock Boardroom',
  [BIOMETRIC_REASON.ConfirmVote]: 'Confirm your vote',
};
const CANCEL_LABEL = 'Annuler';

function aGate(platform = new ScriptedPlatform(), allowDevicePasscode = false) {
  const monitoring = new FakeMonitoring();
  const gate = new DeviceBiometricGate({
    api: platform,
    promptText: (reason) => ({ message: TEXTS[reason], cancelLabel: CANCEL_LABEL }),
    monitoring,
    allowDevicePasscode,
    timeoutMillis: 20,
  });
  return { platform, gate, monitoring };
}

describe('DeviceBiometricGate', () => {
  describe('checkAvailability', () => {
    it('succeeds when the device has the hardware and the user enrolled', async () => {
      const { gate } = aGate();

      expect(await gate.checkAvailability()).toStrictEqual(ok(undefined));
    });

    it('is unavailable without the hardware, and does not ask about the enrolment', async () => {
      const { gate, platform } = aGate();
      platform.hardware = false;
      const enrolment = jest.spyOn(platform, 'isEnrolled');

      expect(await gate.checkAvailability()).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.Unavailable }),
      );
      expect(enrolment).not.toHaveBeenCalled();
    });

    it('is not enrolled when there is the hardware and nothing enrolled', async () => {
      const { gate, platform } = aGate();
      platform.enrolled = false;

      expect(await gate.checkAvailability()).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.NotEnrolled }),
      );
    });

    it.each([
      ['the question about the hardware throws', { hardware: new Error('no module') }],
      ['the question about the enrolment throws', { enrolled: new Error('no module') }],
      ['the question about the hardware never answers', { hardware: 'never' as const }],
      ['the question about the enrolment never answers', { enrolled: 'never' as const }],
    ])('is unavailable, and settles, when %s', async (_name, broken) => {
      const { gate, platform } = aGate();
      Object.assign(platform, broken);

      expect(await gate.checkAvailability()).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.Unavailable }),
      );
    });
  });

  describe('authenticate', () => {
    it('succeeds when the user is recognised', async () => {
      const { gate } = aGate();

      expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(ok(undefined));
    });

    it.each([
      [BIOMETRIC_REASON.UnlockApp, 'Unlock Boardroom'],
      [BIOMETRIC_REASON.ConfirmVote, 'Confirm your vote'],
    ])('shows the text the app gives for the reason %s', async (reason, text) => {
      const { gate, platform } = aGate();

      await gate.authenticate(reason);

      expect(platform.prompts.map((prompt) => prompt.promptMessage)).toEqual([text]);
    });

    it('asks for the text each time, so that it follows the language of the moment', async () => {
      let language = 'en';
      const platform = new ScriptedPlatform();
      const gate = new DeviceBiometricGate({
        api: platform,
        promptText: () => ({
          message: language === 'en' ? 'Unlock' : 'Déverrouiller',
          cancelLabel: language === 'en' ? 'Cancel' : 'Annuler',
        }),
        monitoring: new FakeMonitoring(),
        allowDevicePasscode: false,
      });

      await gate.authenticate(BIOMETRIC_REASON.UnlockApp);
      language = 'fr';
      await gate.authenticate(BIOMETRIC_REASON.UnlockApp);

      expect(platform.prompts.map((prompt) => prompt.promptMessage)).toEqual([
        'Unlock',
        'Déverrouiller',
      ]);
    });

    it('gives the prompt the label of its cancel button in the language of the moment', async () => {
      let language = 'en';
      const platform = new ScriptedPlatform();
      const gate = new DeviceBiometricGate({
        api: platform,
        promptText: () => ({
          message: 'm',
          cancelLabel: language === 'en' ? 'Cancel' : 'Annuler',
        }),
        monitoring: new FakeMonitoring(),
        allowDevicePasscode: false,
      });

      await gate.authenticate(BIOMETRIC_REASON.UnlockApp);
      language = 'fr';
      await gate.authenticate(BIOMETRIC_REASON.UnlockApp);

      expect(platform.prompts.map((prompt) => prompt.cancelLabel)).toEqual(['Cancel', 'Annuler']);
    });

    it.each([BIOMETRIC_REASON.UnlockApp, BIOMETRIC_REASON.ConfirmVote])(
      'asks for strong biometrics on Android, for the reason %s',
      async (reason) => {
        const { gate, platform } = aGate();

        await gate.authenticate(reason);

        expect(platform.prompts.map((prompt) => prompt.biometricsSecurityLevel)).toEqual([
          'strong',
        ]);
      },
    );

    it.each([
      [false, true],
      [true, false],
    ])(
      'with the passcode accepted as a fallback = %s, tells the platform to disable it = %s',
      async (accepted, disabled) => {
        const { gate, platform } = aGate(new ScriptedPlatform(), accepted);

        await gate.authenticate(BIOMETRIC_REASON.ConfirmVote);

        expect(platform.prompts[0]?.disableDeviceFallback).toBe(disabled);
      },
    );

    // Every outcome of the library, with the error of the domain it becomes. Typed over all of
    // them: a code the library adds makes this table, and the mapping, fail the typecheck.
    const OUTCOMES = {
      authentication_failed: BIOMETRIC_ERROR_CODE.Failed,
      unable_to_process: BIOMETRIC_ERROR_CODE.Failed,
      unknown: BIOMETRIC_ERROR_CODE.Failed,
      lockout: BIOMETRIC_ERROR_CODE.LockedOut,
      not_enrolled: BIOMETRIC_ERROR_CODE.NotEnrolled,
      not_available: BIOMETRIC_ERROR_CODE.Unavailable,
      passcode_not_set: BIOMETRIC_ERROR_CODE.Unavailable,
      no_space: BIOMETRIC_ERROR_CODE.Unavailable,
      invalid_context: BIOMETRIC_ERROR_CODE.Unavailable,
      user_cancel: BIOMETRIC_ERROR_CODE.Cancelled,
      app_cancel: BIOMETRIC_ERROR_CODE.Cancelled,
      system_cancel: BIOMETRIC_ERROR_CODE.Cancelled,
      user_fallback: BIOMETRIC_ERROR_CODE.Cancelled,
      timeout: BIOMETRIC_ERROR_CODE.Cancelled,
    } as const satisfies Record<LocalAuthenticationError, string>;

    it.each(Object.entries(OUTCOMES))('turns the outcome %s into %s', async (outcome, code) => {
      const { gate, platform } = aGate();
      platform.outcome = { success: false, error: outcome as LocalAuthenticationError };

      expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(err({ code }));
    });

    it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'])(
      'refuses the outcome %s, which is the name of a property every object has and not a code',
      async (name) => {
        const { gate, platform } = aGate();
        platform.outcome = { success: false, error: name as LocalAuthenticationError };

        expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(
          err({ code: BIOMETRIC_ERROR_CODE.Failed }),
        );
      },
    );

    it.each([
      ['a truthy value that is not true', { success: 'yes' }],
      ['the number 1', { success: 1 }],
      ['an object without success', {}],
      ['nothing', undefined],
      ['null', null],
    ])('does not take %s for a success', async (_name, outcome) => {
      const { gate, platform } = aGate();
      platform.outcome = outcome as never;

      expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.Failed }),
      );
    });

    it('takes a build without the iOS usage description for unavailable biometrics, and reports it as a configuration error', async () => {
      const { gate, platform, monitoring } = aGate();
      platform.outcome = {
        success: false,
        error: 'missing_usage_description' as LocalAuthenticationError,
      };

      expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.Unavailable }),
      );
      expect(monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.BiometricMisconfigured,
          error: { code: BIOMETRIC_ERROR_CODE.Unavailable },
          attributes: undefined,
        },
      ]);
    });

    it("reports nothing for the outcomes that are the user's doing", async () => {
      const { gate, platform, monitoring } = aGate();
      platform.outcome = { success: false, error: 'user_cancel' };

      await gate.authenticate(BIOMETRIC_REASON.UnlockApp);

      expect(monitoring.errors).toEqual([]);
    });

    it('refuses an outcome it does not know, instead of granting it', async () => {
      const { gate, platform } = aGate();
      platform.outcome = { success: false, error: 'something_new' as LocalAuthenticationError };

      expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.Failed }),
      );
    });

    it('is unavailable, and does not reject, when the platform throws', async () => {
      const { gate, platform } = aGate();
      platform.outcome = new Error('no activity');

      expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.Unavailable }),
      );
    });

    it('is unavailable, and does not reject, when the text of the prompt cannot be had', async () => {
      const platform = new ScriptedPlatform();
      const gate = new DeviceBiometricGate({
        api: platform,
        promptText: () => {
          throw new Error('no translation');
        },
        monitoring: new FakeMonitoring(),
        allowDevicePasscode: false,
      });

      expect(await gate.authenticate(BIOMETRIC_REASON.UnlockApp)).toStrictEqual(
        err({ code: BIOMETRIC_ERROR_CODE.Unavailable }),
      );
      expect(platform.prompts).toEqual([]);
    });
  });
});
