import type { ScreenProtectionError } from '@features/documents/domain/errors/ScreenProtectionError';
import type { Result } from '@core/domain/shared/Result';
import type { DocumentId } from '@core/domain/value-objects/ids';

import type { ScreenProtectionCoordinator } from '../ScreenProtectionCoordinator';

export interface CloseDocumentDeps {
  /** The instance shared with `OpenDocument`. */
  readonly screenProtectionCoordinator: ScreenProtectionCoordinator;
}

export interface CloseDocumentInput {
  readonly documentId: DocumentId;
}

/**
 * Called when the viewer leaves a document. The screen protection is turned off only if no other
 * confidential document is still open (see `ScreenProtectionCoordinator`). A document that was not
 * opened by `OpenDocument`, or is already closed, is ignored.
 */
export class CloseDocument {
  constructor(private readonly deps: CloseDocumentDeps) {}

  execute(input: CloseDocumentInput): Promise<Result<void, ScreenProtectionError>> {
    return this.deps.screenProtectionCoordinator.release(input.documentId);
  }
}
