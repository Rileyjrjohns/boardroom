export const STORAGE_ERROR_CODE = {
  ReadFailed: 'storageReadFailed',
  WriteFailed: 'storageWriteFailed',
} as const;

/**
 * The local store could not be read. A miss is not an error: a cache returns it as a value.
 * `cause` is a technical diagnostic for the monitoring tools, never shown to the user, and it is a
 * kind of failure, nothing else: never a file path, a URL, the location of a document or its title,
 * a name, an email, nor the choice of a vote.
 */
export interface StorageReadFailedError {
  readonly code: typeof STORAGE_ERROR_CODE.ReadFailed;
  readonly cause?: string;
}

/** The local store could not be written. */
export interface StorageWriteFailedError {
  readonly code: typeof STORAGE_ERROR_CODE.WriteFailed;
  readonly cause?: string;
}

export type StorageError = StorageReadFailedError | StorageWriteFailedError;

export function storageReadFailed(cause?: string): StorageReadFailedError {
  return cause === undefined
    ? { code: STORAGE_ERROR_CODE.ReadFailed }
    : { code: STORAGE_ERROR_CODE.ReadFailed, cause };
}

export function storageWriteFailed(cause?: string): StorageWriteFailedError {
  return cause === undefined
    ? { code: STORAGE_ERROR_CODE.WriteFailed }
    : { code: STORAGE_ERROR_CODE.WriteFailed, cause };
}
