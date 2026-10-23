/**
 * What the user is owed an explanation of at the start of the app, before anything else: things
 * that happened to the data of the device while the app was not running. The composition root
 * reads them while it starts, and the screens tell the user.
 */
export interface StartupNotices {
  /**
   * Local data was reset (the database could not be read, was set aside, and a new one was
   * created) and the user has not been told. Votes that were waiting to be sent from this device
   * may have been lost.
   */
  readonly localDataReset: boolean;
  /** The user has been told: it will not be told again. Never rejects. */
  acknowledgeLocalDataReset(): Promise<void>;
}

/** The configurations that keep nothing on a device have nothing to tell. */
export const NO_STARTUP_NOTICES: StartupNotices = {
  localDataReset: false,
  acknowledgeLocalDataReset: () => Promise.resolve(),
};
