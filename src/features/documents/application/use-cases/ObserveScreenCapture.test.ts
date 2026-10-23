import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import {
  appLocked,
  notAuthenticated,
  sessionExpired,
} from '@core/domain/errors/AuthenticationError';
import { err } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';
import { NOW, aDocumentId, aSession, aUser, aUserId } from '@testing/domain/builders';

import { SCREEN_CAPTURE_KIND } from '../ports/ScreenProtection';
import type { ScreenCaptureEvent } from '../ports/ScreenProtection';

import { ObserveScreenCapture } from './ObserveScreenCapture';

const INPUT = { documentId: aDocumentId() };

/** Lets the logging that an event started in the background finish. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function observe(
  fakes: ReturnType<typeof createFakes>,
  onCapture: (event: ScreenCaptureEvent) => void = () => undefined,
) {
  const observed = await new ObserveScreenCapture(fakes).execute(INPUT, onCapture);
  if (!observed.ok) throw new Error('the observation should have started');
  return observed.value;
}

type Fakes = ReturnType<typeof createFakes>;

describe('ObserveScreenCapture', () => {
  it('forwards each capture event to the caller', async () => {
    const fakes = createFakes();
    const received: ScreenCaptureEvent[] = [];
    await observe(fakes, (event) => received.push(event));

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStarted });

    expect(received).toEqual([
      { kind: SCREEN_CAPTURE_KIND.ScreenshotTaken },
      { kind: SCREEN_CAPTURE_KIND.RecordingStarted },
    ]);
  });

  it('logs each capture event as a warning, with the document and the user, as identifiers only', async () => {
    const fakes = createFakes();
    await observe(fakes);

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStopped });
    await settle();

    expect(fakes.monitoring.logs).toEqual([
      {
        level: LOG_LEVEL.Warn,
        event: MONITORING_EVENT.ScreenCaptureDetected,
        attributes: {
          [LOG_ATTRIBUTE.CaptureKind]: SCREEN_CAPTURE_KIND.RecordingStopped,
          [LOG_ATTRIBUTE.DocumentId]: aDocumentId(),
          [LOG_ATTRIBUTE.UserId]: aUserId(),
        },
      },
    ]);
    expect(JSON.stringify(fakes.monitoring.logs)).not.toContain(aUser().fullName);
    expect(JSON.stringify(fakes.monitoring.logs)).not.toContain(aUser().email);
  });

  it('logs the user who is signed in when the event happens, not the one who started watching', async () => {
    const fakes = createFakes();
    await observe(fakes);
    fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    await settle();

    expect(fakes.monitoring.logs[0]?.attributes).toMatchObject({
      [LOG_ATTRIBUTE.UserId]: aUserId('user-2'),
    });
  });

  it.each([
    ['nobody is signed in', (fakes: Fakes) => (fakes.auth.session = undefined)],
    ['the session expired', (fakes: Fakes) => fakes.clock.advance(3_600_000)],
    ['the app is locked', (fakes: Fakes) => fakes.appLock.lock()],
  ])('logs the event without a user when %s', async (_name, change) => {
    const fakes = createFakes();
    const received: ScreenCaptureEvent[] = [];
    await observe(fakes, (event) => received.push(event));
    change(fakes);

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStarted });
    await settle();

    expect(received).toEqual([{ kind: SCREEN_CAPTURE_KIND.RecordingStarted }]);
    expect(fakes.monitoring.logs).toEqual([
      {
        level: LOG_LEVEL.Warn,
        event: MONITORING_EVENT.ScreenCaptureDetected,
        attributes: {
          [LOG_ATTRIBUTE.CaptureKind]: SCREEN_CAPTURE_KIND.RecordingStarted,
          [LOG_ATTRIBUTE.DocumentId]: aDocumentId(),
        },
      },
    ]);
  });

  it('forwards the event to the caller at once, without waiting for the session to be read', async () => {
    const fakes = createFakes();
    const received: ScreenCaptureEvent[] = [];
    await observe(fakes, (event) => received.push(event));

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });

    expect(received).toHaveLength(1);
    expect(fakes.monitoring.logs).toEqual([]);
    await settle();
    expect(fakes.monitoring.logs).toHaveLength(1);
  });

  it('succeeds with the function that stops the observation', async () => {
    const fakes = createFakes();
    const received: ScreenCaptureEvent[] = [];
    const unsubscribe = await observe(fakes, (event) => received.push(event));
    expect(fakes.screenProtection.listenerCount).toBe(1);

    unsubscribe();
    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    await settle();

    expect(received).toEqual([]);
    expect(fakes.monitoring.logs).toEqual([]);
    expect(fakes.screenProtection.listenerCount).toBe(0);
  });

  it('requires a valid session: without one nothing is observed', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;
    const useCase = new ObserveScreenCapture(fakes);

    expect(await useCase.execute(INPUT, () => undefined)).toEqual(err(notAuthenticated()));
    fakes.auth.session = aSession({ expiresAt: NOW });
    expect(await useCase.execute(INPUT, () => undefined)).toEqual(err(sessionExpired()));
    fakes.auth.session = aSession();
    fakes.appLock.lock();
    expect(await useCase.execute(INPUT, () => undefined)).toEqual(err(appLocked()));
    expect(fakes.screenProtection.listenerCount).toBe(0);
  });
});
