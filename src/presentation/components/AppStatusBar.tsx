import { StatusBar } from 'react-native';

import { statusBarStyle } from '../theme/tokens';

/**
 * Sets the style of the system bar content (clock, signal, battery) from the theme. It renders
 * nothing, and is mounted once at the root of the app and by the error boundary, which replaces the
 * root: every screen is under one of them, so none is left to the style the system picks.
 *
 * It is React Native's `StatusBar`, not the `statusBarStyle` option of the native stack, for three
 * reasons. The option only reaches the screens of the stack, and the session-ended, startup
 * failure and error screens are outside it. On iOS the option is ignored here: the generated
 * Info.plist sets `UIViewControllerBasedStatusBarAppearance` to false, which is what the
 * `StatusBar` component needs and what react-native-screens' per-screen style does not work with. And on Android,
 * react-native-screens leaves the window alone until a screen gives it a style, and then owns it
 * on every transition, so the two must not be mixed; the `StatusBar` component sets the appearance
 * of the system bars through the window insets controller, which still works with the app drawing
 * edge to edge (only its colour and translucency props are ignored there, and none is used).
 */
export function AppStatusBar() {
  return <StatusBar barStyle={statusBarStyle} />;
}
