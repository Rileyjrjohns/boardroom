/**
 * What every error of the app is: plain data with a `code`. The base is open on purpose: the core
 * knows the families of errors it owns (the repository, the storage and the validation), and each
 * feature declares its own (`AuthenticationError` and `BiometricError` in `auth`, `VotingError` and
 * `VoteDeliveryError` in `votes`, `ScreenProtectionError` in `documents`). A use case that can
 * fail with several of them says so in its own types, as a union of the families it meets.
 *
 * The `code` of each error is unique across every family of the app: the test of
 * `src/composition/glue` that sees them all checks it, so that a union of errors from several
 * concerns can be told apart by `code` alone.
 */
export interface AppError {
  readonly code: string;
}
