import type { FileStore, FileStoreOptions } from '../files/FileStore';

import { nodeFileStore } from './NodeFileVolume';
import { freshDirectory, temporaryDirectory } from './NodeSqlite';

// Test support, not production code: the files of the tests. Importing this module is what makes the
// directory they live in exist, and removes it when the test file is done, so a file that uses it
// imports it at the top (a hook cannot be registered from inside a test).

const parent = temporaryDirectory();

/** A file store in a directory of its own, in the temporary folder of the test file. */
export function testFileStore(options: FileStoreOptions = {}): FileStore {
  return nodeFileStore(`${freshDirectory(parent)}/documents`, options);
}

/** The directory the stores of the test file live in, for a test that looks at what they left. */
export function testFilesDirectory(): string {
  return parent;
}
