import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { useAppServices } from '@composition/shell/services/AppServices';
import type { UseCases } from '@composition/shell/services/AppServices';
import { useSessionOpen } from '@composition/shell/state/useSessionOpen';
import type { DocumentId } from '@core/domain/value-objects/ids';
import { CAPTURE_NOTICE_KEYS } from '@core/presentation/i18n/translationKeys';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { useIsScreenFocused } from '@core/presentation/navigation/useIsScreenFocused';

/** A capture of the screen the user has to be told about. */
export interface CaptureNotice {
  /** The text, as a translation key. */
  readonly message: TranslationKey;
  /**
   * Counts the notices of the screen. Two screenshots in a row say the same words, which a screen
   * reader does not say twice: the number is what makes the second one a new notice.
   */
  readonly sequence: number;
}

export interface CaptureNoticeState {
  readonly notice: CaptureNotice | undefined;
  dismiss(): void;
}

/**
 * The watch for captures of one screen, outside React: subscribes through `ObserveScreenCapture`
 * when it is started, unsubscribes when it is stopped, and holds the last capture worth telling.
 * `ObserveScreenCapture` can take a moment to answer, and a watch that was stopped before it did
 * stops the subscription as soon as it exists.
 */
class CaptureWatch {
  private notice: CaptureNotice | undefined;
  private sequence = 0;
  private readonly listeners = new Set<() => void>();
  private stopWatching: (() => void) | undefined;

  constructor(
    private readonly useCases: Pick<UseCases, 'observeScreenCapture'>,
    private readonly documentId: DocumentId,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getNotice = (): CaptureNotice | undefined => this.notice;

  dismiss = (): void => {
    this.set(undefined);
  };

  start(): void {
    if (this.stopWatching !== undefined) return;
    let here = true;
    let stop: (() => void) | undefined;

    this.stopWatching = () => {
      here = false;
      stop?.();
      stop = undefined;
    };

    void (async () => {
      const subscribed = await this.useCases.observeScreenCapture.execute(
        { documentId: this.documentId },
        (event) => {
          const message = CAPTURE_NOTICE_KEYS[event.kind];
          if (!here || message === undefined) return;
          this.sequence += 1;
          this.set({ message, sequence: this.sequence });
        },
      );
      // Without a session there is nothing to watch for, and the screen is on its way out.
      if (!subscribed.ok) return;
      if (here) stop = subscribed.value;
      else subscribed.value();
    })();
  }

  stop(): void {
    this.stopWatching?.();
    this.stopWatching = undefined;
    this.set(undefined);
  }

  private set(notice: CaptureNotice | undefined): void {
    this.notice = notice;
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * Watches for a screenshot or a screen recording while the screen of a document is shown, through
 * `ObserveScreenCapture`, and keeps the last one worth telling. The use case logs the event, with
 * the document and the user and nothing else; what is left to the screen is to say it was seen.
 *
 * The subscription lasts as long as the screen is shown to the user, and ends when it is not.
 */
export function useScreenCaptureNotice(documentId: DocumentId): CaptureNoticeState {
  const { useCases } = useAppServices();
  const sessionOpen = useSessionOpen();
  const focused = useIsScreenFocused();
  const shown = sessionOpen && focused;

  const watch = useMemo(() => new CaptureWatch(useCases, documentId), [useCases, documentId]);
  const notice = useSyncExternalStore(watch.subscribe, watch.getNotice);

  useEffect(() => {
    if (!shown) return undefined;
    watch.start();
    return () => {
      watch.stop();
    };
  }, [watch, shown]);

  const dismiss = useCallback(() => {
    watch.dismiss();
  }, [watch]);

  return { notice, dismiss };
}
