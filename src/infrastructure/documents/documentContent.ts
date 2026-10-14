import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';

import type { FileStore, FileStoreFailure } from '../files/FileStore';

// What the document caches ask of the files, by location. A location is the opaque reference that
// the repository handed out; the store reads the name of the file out of it. A location that is not
// a file of the store (a leftover of an earlier version of the app, a reference to somewhere else)
// has no content here: nothing to find, and nothing to delete.

/** Whether the content a location points at is on the device. A location that is no file of the store has none. */
export async function contentExists(
  files: FileStore,
  location: DocumentLocation,
): Promise<Result<boolean, FileStoreFailure>> {
  const name = files.nameOf(location);
  if (name === undefined) return ok(false);
  const stat = await files.stat(name);
  return stat.ok ? ok(stat.value !== undefined) : err(stat.error);
}

/** Deletes the content a location points at. What is not there, or is not a file of the store, is already gone. */
export async function deleteContent(
  files: FileStore,
  location: DocumentLocation,
): Promise<Result<void, FileStoreFailure>> {
  const name = files.nameOf(location);
  return name === undefined ? ok(undefined) : files.delete(name);
}
