import { NavigationContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useSyncExternalStore } from 'react';

/** The events a screen of a navigator is told when the user comes to it and leaves it. */
const SCREEN_EVENT = {
  Focus: 'focus',
  Blur: 'blur',
} as const;

/** What a screen that is not in a navigator subscribes to: nothing ever changes. */
const NEVER_CHANGES = (): (() => void) => () => undefined;

/**
 * Whether the screen this is called from is the one the user is looking at. A stack keeps the
 * screens below the top one mounted, so what a screen does on its own account (announcing a banner
 * to the screen reader, say) is done by all of them at once unless it asks.
 *
 * Outside of any navigator (a component of the root, a test of a component on its own) there is no
 * screen to be behind another, and the answer is yes. `useIsFocused` of the router throws there.
 */
export function useIsScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (navigation === undefined) return NEVER_CHANGES();
      const unsubscribeFocus = navigation.addListener(SCREEN_EVENT.Focus, onChange);
      const unsubscribeBlur = navigation.addListener(SCREEN_EVENT.Blur, onChange);
      return () => {
        unsubscribeFocus();
        unsubscribeBlur();
      };
    },
    [navigation],
  );

  return useSyncExternalStore(subscribe, () => navigation?.isFocused() ?? true);
}
