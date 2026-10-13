import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentId } from '@domain/value-objects/ids';

import type { AuthSession } from '../../ports/AuthSession';
import type { Clock } from '../../ports/Clock';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import type { Monitoring } from '../../ports/Monitoring';
import type {
  ScreenCaptureEvent,
  ScreenProtection,
  Unsubscribe,
} from '../../ports/ScreenProtection';
import { requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';

export interface ObserveScreenCaptureDeps {
  readonly auth: AuthSession;
  readonly clock: Clock;
  readonly screenProtection: ScreenProtection;
  readonly monitoring: Monitoring;
}

export interface ObserveScreenCaptureInput {
  /** The document on the screen. */
  readonly documentId: DocumentId;
}

/**
 * Watches for screenshots and screen recordings while a document is shown. Requires a valid
 * session: each event is logged with the id of the document and the id of the signed-in user
 * (identifiers only, no name nor email), then given to `onCapture` (the screen shows a warning,
 * say). Succeeds with the function that stops watching.
 */
export class ObserveScreenCapture {
  constructor(private readonly deps: ObserveScreenCaptureDeps) {}

  async execute(
    input: ObserveScreenCaptureInput,
    onCapture: (event: ScreenCaptureEvent) => void,
  ): Promise<Result<Unsubscribe, SessionRequiredError>> {
    const { screenProtection, monitoring } = this.deps;

    const session = await requireSession(this.deps);
    if (isErr(session)) return session;
    const userId = session.value.user.id;

    return ok(
      screenProtection.subscribe((event) => {
        monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.ScreenCaptureDetected, {
          [LOG_ATTRIBUTE.CaptureKind]: event.kind,
          [LOG_ATTRIBUTE.DocumentId]: input.documentId,
          [LOG_ATTRIBUTE.UserId]: userId,
        });
        onCapture(event);
      }),
    );
  }
}
