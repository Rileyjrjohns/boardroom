import { SCREEN_CAPTURE_KIND } from '@application/ports/ScreenProtection';
import { describeScreenProtectionContract } from '@application/testing/contracts/screenProtectionContract';
import {
  screenProtectionFailed,
  screenProtectionUnsupported,
} from '@domain/errors/ScreenProtectionError';
import { err, ok } from '@domain/shared/Result';

import { InMemoryScreenProtection } from './InMemoryScreenProtection';

describeScreenProtectionContract('InMemoryScreenProtection', () => {
  const protection = new InMemoryScreenProtection();
  return {
    protection,
    isEnabled: () => protection.isEnabled(),
    emit: (event) => protection.emit(event),
  };
});

describe('InMemoryScreenProtection, configured for a test', () => {
  it('fails to enable while told to, and stays off', async () => {
    const protection = new InMemoryScreenProtection();
    protection.failEnableWith(screenProtectionUnsupported());

    expect(await protection.enable()).toStrictEqual(err(screenProtectionUnsupported()));
    expect(protection.isEnabled()).toBe(false);

    protection.failEnableWith(undefined);
    expect(await protection.enable()).toStrictEqual(ok(undefined));
    expect(protection.isEnabled()).toBe(true);
  });

  it('fails to disable while told to, and stays on', async () => {
    const protection = new InMemoryScreenProtection();
    await protection.enable();
    protection.failDisableWith(screenProtectionFailed());

    expect(await protection.disable()).toStrictEqual(err(screenProtectionFailed()));
    expect(protection.isEnabled()).toBe(true);

    protection.failDisableWith(undefined);
    expect(await protection.disable()).toStrictEqual(ok(undefined));
    expect(protection.isEnabled()).toBe(false);
  });

  it('reports a capture to the subscribers', () => {
    const protection = new InMemoryScreenProtection();
    const received: string[] = [];
    protection.subscribe((event) => received.push(event.kind));

    protection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStarted });

    expect(received).toEqual([SCREEN_CAPTURE_KIND.RecordingStarted]);
  });
});
