import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useIsScreenFocused } from '../navigation/useIsScreenFocused';
import { isIos } from '../platform/devicePlatform';

/**
 * Has the screen reader say `message` when it appears or changes, on iOS. VoiceOver does not read
 * a text that shows up on its own; React Native has no live region for it, so the text is posted as
 * an announcement. On Android the same job is done by a live region on the text itself (see
 * `LiveText`), which TalkBack reads when the text changes: announcing it here as well would say it
 * twice, so this does nothing there. Nothing is announced for `undefined`.
 *
 * Only the screen the user is looking at announces. The list stays mounted under the detail of a
 * meeting, and both show the same banner: a change of the connection would otherwise be said once
 * by each. A message that changes while its screen is behind another is taken as said (by the
 * screen on top), and is not announced when the user comes back to it.
 */
export function useAnnounce(message: string | undefined): void {
  const focused = useIsScreenFocused();
  const announced = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (message === announced.current) return;
    announced.current = message;
    if (message !== undefined && focused && isIos()) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message, focused]);
}
