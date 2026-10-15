import { requireNativeView } from 'expo';
import { useEffect } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { SecureLayerFallbackEvent } from './ScreenProtection.types';

const MODULE_NAME = 'ScreenProtection';
const VIEW_NAME = 'ScreenProtectionSecureView';

/** Why the children are in a plain container when `secure` was asked for. */
const REASON_VIEW_MISSING = 'the native view is not in this build';

export interface ScreenProtectionSecureViewProps {
  /**
   * Whether the children must be left out of captures. `false` makes the view a plain container.
   *
   * On iOS the view sets the private `disableUpdateMask` flag on its own layer, the flag UIKit sets
   * for a secure text field, so the layer and everything in it are blank in screenshots (checked
   * for screenshots on a physical iPhone under iOS 27; recordings and mirroring are not checked).
   * That is undocumented behaviour: when the layer has no such property the view stays a plain
   * container and `onSecureLayerFallback` is called, once. On Android the view is a plain
   * container, because the window flag set by the module already blocks captures there.
   */
  readonly secure: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
  /** The content is not left out of captures although `secure` is on. Not called on Android. */
  readonly onSecureLayerFallback?: ((event: SecureLayerFallbackEvent) => void) | undefined;
}

interface NativeSecureViewProps {
  readonly secure: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
  readonly onSecureLayerFallback: (event: { nativeEvent: SecureLayerFallbackEvent }) => void;
}

/**
 * The native view, or `null` when the build has none (a development client made before the view
 * existed): the native component is only asked for when its view config is registered, since
 * rendering an unregistered one is an error of the renderer. Never throws.
 */
function loadNativeView(): ComponentType<NativeSecureViewProps> | null {
  try {
    if (globalThis.expo.getViewConfig(MODULE_NAME, VIEW_NAME) === null) return null;
    return requireNativeView<NativeSecureViewProps>(MODULE_NAME, VIEW_NAME);
  } catch {
    return null;
  }
}

const NativeSecureView = loadNativeView();

/**
 * A container whose children are left out of captures on iOS (see `secure`). The children render and
 * take touches as usual. Without the native view it is a plain `View`, and says so through
 * `onSecureLayerFallback` when `secure` is on.
 */
export function ScreenProtectionSecureView({
  secure,
  style,
  children,
  testID,
  onSecureLayerFallback,
}: ScreenProtectionSecureViewProps) {
  const missing = NativeSecureView === null;

  useEffect(() => {
    if (missing && secure) onSecureLayerFallback?.({ reason: REASON_VIEW_MISSING });
  }, [missing, secure, onSecureLayerFallback]);

  if (NativeSecureView === null) {
    return (
      <View style={style} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <NativeSecureView
      secure={secure}
      style={style}
      testID={testID}
      onSecureLayerFallback={(event) => {
        onSecureLayerFallback?.(event.nativeEvent);
      }}
    >
      {children}
    </NativeSecureView>
  );
}
