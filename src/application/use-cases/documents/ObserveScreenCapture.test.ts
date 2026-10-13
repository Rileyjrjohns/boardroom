import { notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import { err } from '@domain/shared/Result';
import { NOW, aDocumentId, aSession, aUser, aUserId } from '@domain/testing/builders';

import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { SCREEN_CAPTURE_KIND } from '../../ports/ScreenProtection';
import type { ScreenCaptureEvent } from '../../ports/ScreenProtection';
import { createFakes } from '../../testing/createFakes';

import { ObserveScreenCapture } from './ObserveScreenCapture';

const INPUT = { documentId: aDocumentId() };

async function observe(
  fakes: ReturnType<typeof createFakes>,
  onCapture: (event: ScreenCaptureEvent) => void = () => undefined,
) {
  const observed = await new ObserveScreenCapture(fakes).execute(INPUT, onCapture);
  if (!observed.ok) throw new Error('the observation should have started');
  return observed.value;
}

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

  it('logs the user who was signed in when the observation started', async () => {
    const fakes = createFakes();
    fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
    await observe(fakes);

    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });

    expect(fakes.monitoring.logs[0]?.attributes).toMatchObject({
      [LOG_ATTRIBUTE.UserId]: aUserId('user-2'),
    });
  });

  it('succeeds with the function that stops the observation', async () => {
    const fakes = createFakes();
    const received: ScreenCaptureEvent[] = [];
    const unsubscribe = await observe(fakes, (event) => received.push(event));
    expect(fakes.screenProtection.listenerCount).toBe(1);

    unsubscribe();
    fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });

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
    expect(fakes.screenProtection.listenerCount).toBe(0);
  });
});
