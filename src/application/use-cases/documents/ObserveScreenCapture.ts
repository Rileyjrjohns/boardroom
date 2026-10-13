import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentId } from '@domain/value-objects/ids';

import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import type { LogAttributes } from '../../ports/Monitoring';
import type {
  ScreenCaptureEvent,
  ScreenProtection,
  Unsubscribe,
} from '../../ports/ScreenProtection';
import { requireSession } from '../../shared/requireSession';
import type { RequireSessionDeps, SessionRequiredError } from '../../shared/requireSession';

export interface ObserveScreenCaptureDeps extends RequireSessionDeps {
  readonly screenProtection: ScreenProtection;
}

export interface ObserveScreenCaptureInput {
  /** The document on the screen. */
  readonly documentId: DocumentId;
}

/**
 * Watches for screenshots and screen recordings while a document is shown. Requires a valid
 * session to start. Each event is given to `onCapture` at once (the screen shows a warning, say),
 * then logged with the id of the document and the id of the user who is signed in when the event
 * happens, checked again at that moment: the subscription can outlive a sign-out and a sign-in,
 * and the capture must not be attributed to the user who started watching. When nobody is signed
 * in, or the session is not usable, the event is logged without a user. Identifiers only, no name
 * nor email. Succeeds with the function that stops watching.
 */
export class ObserveScreenCapture {
  constructor(private readonly deps: ObserveScreenCaptureDeps) {}

  async execute(
    input: ObserveScreenCaptureInput,
    onCapture: (event: ScreenCaptureEvent) => void,
  ): Promise<Result<Unsubscribe, SessionRequiredError>> {
    const started = await requireSession(this.deps);
    if (isErr(started)) return started;

    return ok(
      this.deps.screenProtection.subscribe((event) => {
        onCapture(event);
        void this.log(input.documentId, event);
      }),
    );
  }

  private async log(documentId: DocumentId, event: ScreenCaptureEvent): Promise<void> {
    const session = await requireSession(this.deps);
    const attributes: LogAttributes = {
      [LOG_ATTRIBUTE.CaptureKind]: event.kind,
      [LOG_ATTRIBUTE.DocumentId]: documentId,
      ...(isErr(session) ? {} : { [LOG_ATTRIBUTE.UserId]: session.value.user.id }),
    };
    this.deps.monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.ScreenCaptureDetected, attributes);
  }
}
