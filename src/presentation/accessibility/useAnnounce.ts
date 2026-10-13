import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Has the screen reader say `message` when it appears or changes, on iOS. VoiceOver does not read
 * a text that shows up on its own; React Native has no live region for it, so the text is posted as
 * an announcement. On Android the same job is done by a live region on the text itself (see
 * `LiveText`), which TalkBack reads when the text changes: announcing it here as well would say it
 * twice, so this does nothing there. Nothing is announced for `undefined`.
 */
export function useAnnounce(message: string | undefined): void {
  useEffect(() => {
    if (message !== undefined && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
}
