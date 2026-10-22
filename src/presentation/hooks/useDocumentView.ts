import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import type { DocumentId } from '@domain/value-objects/ids';
import type { OpenedDocument } from '@application/use-cases/documents/OpenDocument';
import { isSessionEndingCode } from '@application/shared/sessionPolicy';

import type { DocumentErrorCode } from '../i18n/translationKeys';
import { useIsScreenFocused } from '../navigation/useIsScreenFocused';
import { useAppServices } from '../services/AppServices';
import type { UseCases } from '../services/AppServices';
import { useUiStoreApi } from '../state/uiStore';
import type { UiStore } from '../state/uiStore';

import { useSessionOpen } from './useSessionOpen';

export const DOCUMENT_VIEW_STATUS = {
  /** The document is being opened: fetched, or read from the copy saved on the device. */
  Loading: 'loading',
  /** Opened: the screen is protected if the document needs it, and the content can be shown. */
  Ready: 'ready',
  /** Could not be opened. */
  Failed: 'failed',
} as const;

export type DocumentViewState =
  | { readonly status: typeof DOCUMENT_VIEW_STATUS.Loading }
  | { readonly status: typeof DOCUMENT_VIEW_STATUS.Ready; readonly opened: OpenedDocument }
  | { readonly status: typeof DOCUMENT_VIEW_STATUS.Failed; readonly code: DocumentErrorCode };

export interface DocumentView {
  readonly state: DocumentViewState;
  /** Opens the document again: after a failure, or when what was opened could not be displayed. */
  retry(): void;
}

const LOADING: DocumentViewState = { status: DOCUMENT_VIEW_STATUS.Loading };

/**
 * One viewing of a document, outside React: opens it with `OpenDocument` when it is started and
 * releases it with `CloseDocument` when it is stopped, exactly once for each time it was opened,
 * and holds what the screen shows meanwhile. The screen reads it through `useSyncExternalStore`
 * (see `useDocumentView`).
 *
 * `OpenDocument` can take long (it asks the server, and the server can be slow), so the viewing
 * may be stopped before it answers. A document that opens for a viewing that has stopped is
 * released at once: the view it counted would otherwise stay counted, and the protection with it.
 *
 * A failure that ends the session ends it for the whole app, told to the interface store the way
 * the query cache tells it (`isSessionEndingCode`).
 */
class DocumentViewing {
  private state: DocumentViewState = LOADING;
  private readonly listeners = new Set<() => void>();
  private stopViewing: (() => void) | undefined;

  constructor(
    private readonly useCases: Pick<UseCases, 'openDocument' | 'closeDocument'>,
    private readonly store: UiStore,
    private readonly documentId: DocumentId,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): DocumentViewState => this.state;

  /** Starts opening the document. Does nothing if it is already started. */
  start(): void {
    if (this.stopViewing !== undefined) return;
    const { useCases, store, documentId } = this;
    let here = true;
    let held = false;
    const epoch = store.getState().accessEpoch;

    const release = (): void => {
      if (!held) return;
      held = false;
      void useCases.closeDocument.execute({ documentId });
    };
    const settle = (state: DocumentViewState): void => {
      if (here) this.set(state);
    };
    const fail = (code: DocumentErrorCode): void => {
      if (isSessionEndingCode(code)) store.getState().endSession(code, epoch);
      settle({ status: DOCUMENT_VIEW_STATUS.Failed, code });
    };

    this.stopViewing = () => {
      here = false;
      release();
    };
    this.set(LOADING);

    void (async () => {
      try {
        const opened = await useCases.openDocument.execute({ documentId });
        if (!opened.ok) {
          fail(opened.error.code);
          return;
        }
        held = true;
        if (here) this.set({ status: DOCUMENT_VIEW_STATUS.Ready, opened: opened.value });
        else release();
      } catch {
        // A use case does not throw; if one does, it is a failure like any other.
        fail(REPOSITORY_ERROR_CODE.Unexpected);
      }
    })();
  }

  /** Stops the viewing: the document is released, and the screen holds nothing of it any more. */
  stop(): void {
    this.stopViewing?.();
    this.stopViewing = undefined;
    this.set(LOADING);
  }

  private set(state: DocumentViewState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * A document, from the moment its screen is shown to the moment it is left: opens it with
 * `OpenDocument` and releases it with `CloseDocument`, exactly once for each time it was opened.
 *
 * It is a lifecycle and not a query, on purpose. Opening a document does something: it turns the
 * screen protection on, counts a view of the document and logs the access, so running it again
 * (a refetch, a second observer of the same query) would count a second view that nothing would
 * release, and the protection would stay on after the screen is gone. A query would also keep the
 * location of the content and the name of the reader in the cache for as long as it keeps data.
 * Here the document lives in the state of the screen and goes with it.
 *
 * The document is open while the screen is shown to the user (`useIsScreenFocused`) and the app is
 * open (`useSessionOpen`), and released when either stops being true: the user goes back, another
 * screen is put over this one, the app locks, the user signs out or the session ends. The
 * navigator removes the screens of an app that is no longer open, which unmounts this one, so the
 * release does not depend on this hook noticing; the second condition is there for a screen that
 * stays mounted for a render.
 */
export function useDocumentView(documentId: DocumentId): DocumentView {
  const { useCases } = useAppServices();
  const store = useUiStoreApi();
  const sessionOpen = useSessionOpen();
  const focused = useIsScreenFocused();
  const shown = sessionOpen && focused;
  const [attempt, setAttempt] = useState(0);

  const viewing = useMemo(
    () => new DocumentViewing(useCases, store, documentId),
    [useCases, store, documentId],
  );
  const state = useSyncExternalStore(viewing.subscribe, viewing.getState);

  useEffect(() => {
    if (!shown) return undefined;
    viewing.start();
    return () => {
      viewing.stop();
    };
    // A new attempt is a new start: the effect is run again, and the viewing was stopped first.
  }, [viewing, shown, attempt]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  return { state, retry };
}
