import { Fragment, createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CORE_TEST_IDS } from '../testIds';

/** What a `Dialog` hands to its host: its window, and whether it is open. */
interface HostedDialog {
  readonly window: ReactNode;
  readonly visible: boolean;
}

interface DialogHostValue {
  /** Puts the window of a dialog in the host, or updates it. */
  show(id: string, dialog: HostedDialog): void;
  /** Takes the window of a dialog out, because the dialog is gone. */
  hide(id: string): void;
}

const DialogHostContext = createContext<DialogHostValue | undefined>(undefined);

/** The host of the dialogs below, if there is one: a `Dialog` outside of any host draws itself. */
export function useDialogHost(): DialogHostValue | undefined {
  return useContext(DialogHostContext);
}

interface DialogHostProps {
  /** Whether the content must be out of reach of the screen reader, because something covers it. */
  readonly covered: boolean;
  /** The content of the app: everything the dialogs and the cover come up over. */
  readonly children: ReactNode;
}

/**
 * Holds the content of the app and the windows of its dialogs side by side, so that the content can
 * be hidden from the screen reader while something is over it, and the windows cannot:
 *
 * - **Android.** The content is flagged `no-hide-descendants` while the privacy cover or a dialog
 *   is shown. A dialog is a window of its own and TalkBack stays in it, but the screen under it
 *   is still part of the accessibility tree of the app, and the cover is a view over the content,
 *   which the screen reader walks past to what is below unless it is told not to. (On iOS the
 *   same job is done by `accessibilityViewIsModal` of the dialog and of the cover, and
 *   `accessibilityElementsHidden` here.)
 * - A dialog is drawn by the host, not where it is written: it is a descendant of the screen that
 *   opened it, and would be hidden with it. The `Dialog` component hands its window to the host
 *   (`useDialogHost`) on every render, and draws it itself when there is no host (a screen on its
 *   own, a test of a component).
 */
export function DialogHost({ covered, children }: DialogHostProps) {
  const [dialogs, setDialogs] = useState<ReadonlyMap<string, HostedDialog>>(() => new Map());
  const host = useMemo<DialogHostValue>(
    () => ({
      show: (id, dialog) => {
        setDialogs((previous) => new Map(previous).set(id, dialog));
      },
      hide: (id) => {
        setDialogs((previous) => {
          if (!previous.has(id)) return previous;
          const next = new Map(previous);
          next.delete(id);
          return next;
        });
      },
    }),
    [],
  );
  const open = [...dialogs.values()].some(({ visible }) => visible);
  const hidden = covered || open;

  return (
    <DialogHostContext.Provider value={host}>
      <View
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        style={styles.content}
        testID={CORE_TEST_IDS.appContent}
      >
        {children}
      </View>
      {[...dialogs.entries()].map(([id, { window }]) => (
        <Fragment key={id}>{window}</Fragment>
      ))}
    </DialogHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
