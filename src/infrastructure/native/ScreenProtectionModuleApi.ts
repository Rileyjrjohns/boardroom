/** The payload of the native `onCaptureChanged` event. */
export interface CaptureChangedPayload {
  /** Whether the screen is being recorded, mirrored or AirPlayed now. */
  readonly captured: boolean;
}

/**
 * The events of the native module, by name. They are the ones the Swift and Kotlin definitions
 * declare (`modules/screen-protection`); the real module is assigned to `ScreenProtectionModuleApi`
 * in `loadScreenProtectionModule`, so a name that drifts fails the typecheck.
 */
export interface ScreenProtectionEvents {
  onScreenshotTaken: () => void;
  onCaptureChanged: (payload: CaptureChangedPayload) => void;
}

export const NATIVE_EVENT = {
  ScreenshotTaken: 'onScreenshotTaken',
  CaptureChanged: 'onCaptureChanged',
} as const satisfies Record<string, keyof ScreenProtectionEvents>;

/** What stops a native listener. */
export interface NativeSubscription {
  remove(): void;
}

/**
 * What the adapter asks of the native module `ScreenProtection`: the seam it is written against, as
 * `NetworkStateApi` is for `expo-network`. The module is assigned to it where it is loaded; the
 * tests give the adapter a stand-in written in JavaScript.
 *
 * Any call may reject, throw or never answer: the adapter bounds them and turns a failure into a
 * result.
 */
export interface ScreenProtectionModuleApi {
  /** Turns the protection on or off. Idempotent. Resolves once the change has been made. */
  setProtectionEnabled(enabled: boolean): Promise<void>;
  /** Whether the screen is being recorded, mirrored or AirPlayed right now. */
  isCaptured(): Promise<boolean>;
  /** Listens to an event of the module. The system listeners behind it exist while one is added. */
  addListener<Name extends keyof ScreenProtectionEvents>(
    eventName: Name,
    listener: ScreenProtectionEvents[Name],
  ): NativeSubscription;
}
