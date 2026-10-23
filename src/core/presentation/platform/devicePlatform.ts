import { Platform } from 'react-native';

/** The platforms the layer tells apart. */
export const DEVICE_PLATFORM = {
  Ios: 'ios',
  Android: 'android',
} as const;

/**
 * Whether the app runs on iOS. It is read when it is asked, not when the module loads: a test
 * replaces `Platform.OS` to check what each platform does, and a constant would have been fixed
 * by then. The one place that compares with `Platform.OS`, so that a platform check is spelled once.
 */
export function isIos(): boolean {
  return Platform.OS === DEVICE_PLATFORM.Ios;
}
