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
 * is one global switch; this keeps the views that are open and switches the protection off only
 * when the last one is closed. Closing document B while document A is still displayed leaves the
 * screen protected.
 *
 * It counts the views of each document, not the documents: a document opened twice (two screens,
 * a screen that opens it again before the first was closed) is two views, and closing one of them
 * leaves the other one protected.
 *
 * Calls are serialised. `acquire` and `release` are queued, and each one starts only when the one
 * before has settled, so the calls reach the platform in the order they were made and a slow
 * `disable` of A can never land after the `enable` of B that was asked for later. The queue and the
 * counts are the only state, in memory: they die with the app, as does the protection of the screen.
 *
 * One instance must be shared by every use case that opens or closes a document (`OpenDocument`,
 * `CloseDocument`): the composition root creates it once and injects it. Two instances would each
 * count their own views, and each would switch the protection off on its own say-so.
 */
export class ScreenProtectionCoordinator {
  private readonly views = new Map<DocumentId, number>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ScreenProtectionCoordinatorDeps) {}

  /**
   * A view of a document that must be protected is being shown: turns the protection on, and
   * counts the view only if that worked. A failure is returned and nothing is counted, so the
   * caller must not show the document.
   */
  acquire(documentId: DocumentId): Promise<Result<void, ScreenProtectionError>> {
    return this.enqueue(async () => {
      const enabled = await this.deps.screenProtection.enable();
      if (isErr(enabled)) return enabled;

      this.views.set(documentId, (this.views.get(documentId) ?? 0) + 1);
      return ok(undefined);
    });
  }

  /**
   * A view of a document is closed. A document with no view is ignored (no effect, success). When
   * it was the last view of all, turns the protection off. If that fails the view stays counted,
   * since the screen is still protected, and the failure is returned: calling again retries.
   */
  release(documentId: DocumentId): Promise<Result<void, ScreenProtectionError>> {
    return this.enqueue(async () => {
      const count = this.views.get(documentId) ?? 0;
      if (count === 0) return ok(undefined);

      if (this.totalViews() > 1) {
        this.drop(documentId);
        return ok(undefined);
      }

      const disabled = await this.deps.screenProtection.disable();
      if (isErr(disabled)) return disabled;

      this.drop(documentId);
      return ok(undefined);
    });
  }

  /** Runs a task once every task queued before it has settled, whatever their outcome. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private totalViews(): number {
    let total = 0;
    for (const count of this.views.values()) total += count;
    return total;
  }

  private drop(documentId: DocumentId): void {
    const count = this.views.get(documentId) ?? 0;
    if (count <= 1) this.views.delete(documentId);
    else this.views.set(documentId, count - 1);
  }
}
