/** The payload of `onCaptureChanged`. */
export interface CaptureChangedEvent {
  /** Whether the screen is being recorded, mirrored or AirPlayed now. */
  readonly captured: boolean;
}

/** The events of the module, by name. Same names in Swift and Kotlin. */
export type ScreenProtectionModuleEvents = {
  /** A screenshot of the app was taken. No payload. */
  onScreenshotTaken: () => void;
  /** The screen started or stopped being captured. Sent when the state changes, not repeated. */
  onCaptureChanged: (event: CaptureChangedEvent) => void;
};
