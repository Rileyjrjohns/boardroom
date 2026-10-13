import type { ScreenProtectionError } from '@domain/errors/ScreenProtectionError';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentId } from '@domain/value-objects/ids';

import type { ScreenProtection } from '../ports/ScreenProtection';

export interface ScreenProtectionCoordinatorDeps {
  readonly screenProtection: ScreenProtection;
}

/**
 * Decides when the screen protection is on, so that no adapter has to. The `ScreenProtection` port
 * is one global switch; this keeps the list of the confidential documents that are open and
 * switches the protection off only when the last one is closed. Closing document B while document A
 * is still displayed leaves the screen protected.
 *
 * One instance must be shared by every use case that opens or closes a document (`OpenDocument`,
 * `CloseDocument`): the composition root creates it once and injects it. It holds the only state,
 * a set in memory, and it dies with the app, as does the protection of the screen.
 *
 * Calls are expected to be made one after the other, as the screens do. Releasing a document while
 * its own `acquire` is still waiting for the platform is not supported.
 */
export class ScreenProtectionCoordinator {
  private readonly openDocuments = new Set<DocumentId>();

  constructor(private readonly deps: ScreenProtectionCoordinatorDeps) {}

  /**
   * A confidential document is being shown: turns the protection on, and remembers the document
   * only if that worked. Acquiring a document that is already registered is harmless. A failure
   * is returned and the document is not registered, so the caller must not show it.
   */
  async acquire(documentId: DocumentId): Promise<Result<void, ScreenProtectionError>> {
    const enabled = await this.deps.screenProtection.enable();
    if (isErr(enabled)) return enabled;

    this.openDocuments.add(documentId);
    return ok(undefined);
  }

  /**
   * A document is no longer shown. An unknown document is ignored (no effect, success). When it
   * was the last one registered, turns the protection off. If that fails the document stays
   * registered, since the screen is still protected, and the failure is returned: calling again
   * retries.
   */
  async release(documentId: DocumentId): Promise<Result<void, ScreenProtectionError>> {
    if (!this.openDocuments.has(documentId)) return ok(undefined);
    if (this.openDocuments.size > 1) {
      this.openDocuments.delete(documentId);
      return ok(undefined);
    }

    const disabled = await this.deps.screenProtection.disable();
    if (isErr(disabled)) return disabled;

    this.openDocuments.delete(documentId);
    return ok(undefined);
  }
}
