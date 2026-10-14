import { requireOptionalNativeModule } from 'expo';
import type { NativeModule } from 'expo';

import type { ScreenProtectionModuleEvents } from './ScreenProtection.types';

/**
 * The native module, as the Swift and Kotlin definitions declare it.
 *
 * - `setProtectionEnabled(enabled)`: Android sets or clears `FLAG_SECURE` on the window of the
 *   current activity (screenshots and recordings are blocked, the recents thumbnail is blank). iOS
 *   puts a neutral view over the app while the scene is inactive. Idempotent; resolves once the
 *   change is made; rejects when the platform could not make it.
 * - `isCaptured()`: whether the screen is being recorded, mirrored or AirPlayed right now. Always
 *   false on Android before 15, which cannot tell.
 * - the events of `ScreenProtectionModuleEvents`, through `addListener`. The system listeners behind
 *   them exist only while there is a listener.
 */
export declare class ScreenProtectionModule extends NativeModule<ScreenProtectionModuleEvents> {
  setProtectionEnabled(enabled: boolean): Promise<void>;
  isCaptured(): Promise<boolean>;
}

/**
 * `null` when the build has no such module (a development client made before it existed, or a
 * platform it does not support): importing this file never throws, the caller decides what a
 * missing module means.
 */
export default requireOptionalNativeModule<ScreenProtectionModule>('ScreenProtection');
