import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { ScreenProtectionSecureView } from '../../../modules/screen-protection';
import { TEST_IDS } from '../testIds';

interface SecureContentProps {
  /** Whether the content must come out blank in screenshots and screen recordings. */
  readonly secure: boolean;
  readonly children: ReactNode;
}

/**
 * Puts its children in a container that is left out of captures when `secure` is on: on iOS it is
 * blank in screenshots (checked on a phone; recordings and mirroring are not checked); on Android
 * the window flag of the screen protection already does it. The children render and take touches as
 * usual: the PDF scrolls, zooms and answers a long-press as it would without it. With `secure` off
 * it is a plain container.
 *
 * **The one component of the presentation that imports the native module.** Everything else
 * reaches the screen protection through the `ScreenProtection` port, and the dependency rule and
 * `no-restricted-imports` still say so (see `eslint.config.mjs`). This is a narrow exception,
 * made for a reason the port cannot serve: a port carries data and calls, and what is needed here is
 * a native *view*, an element of the tree that the children are mounted in. A view cannot cross a
 * port, so the component that mounts it is the adapter of that view, and only the import of this
 * file is let through (a lint rule, with tests). It takes `secure` and the children and nothing
 * else, so the module's own functions and events stay behind the port.
 *
 * It relies on undocumented behaviour of iOS (the private layer flag that secure text fields get).
 * When the layer has no such flag the children are in a plain container and nothing is lost but the
 * protection: the native side logs it, and the view reports it as an event.
 */
export function SecureContent({ secure, children }: SecureContentProps) {
  return (
    <ScreenProtectionSecureView
      secure={secure}
      style={styles.fill}
      testID={TEST_IDS.documentSecureContent}
    >
      {children}
    </ScreenProtectionSecureView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
