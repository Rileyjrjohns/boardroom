import type { DocumentFiles } from '@application/testing/contracts/documentCacheContract';

import { createFileStore } from '../files/FileStore';
import type { FileStore } from '../files/FileStore';

import { FaultyFileVolume } from './FaultyFileVolume';
import { NodeFileVolume } from './NodeFileVolume';
import { freshDirectory } from './NodeSqlite';

// Test support, not production code: the files of a device for the tests of the document caches. The
// contract suite of `DocumentCache` places its content at locations such as
// `file:///documents/document-1.pdf`, so the store says that is where its directory is, and the
// harness it offers (`files`) writes, looks at, loses and refuses to delete the files behind them.

/** Where the contract suite says the documents are. */
export const CONTRACT_DOCUMENTS_URI = 'file:///documents/';

/** What the content of a file is, in the tests: it is never read. */
const CONTENT = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

export interface DocumentDevice {
  readonly store: FileStore;
  readonly volume: FaultyFileVolume;
  /** What the contract suite of `DocumentCache` asks of the files. */
  readonly files: DocumentFiles;
}

export interface DocumentDeviceOptions {
  /** How long a call on the files may take. Defaults to the one of the store. */
  readonly timeoutMillis?: number;
  /**
   * Say the files are where they are (`file:///tmp/...`) instead of where the contract suite puts
   * them, for a test that reads them back from the disk.
   */
  readonly realLocations?: boolean;
}

/** The files of a device, in a directory of its own under `parent`. */
export function aDocumentDevice(
  parent: string,
  options: DocumentDeviceOptions = {},
): DocumentDevice {
  const directory = `${freshDirectory(parent)}/documents`;
  const volume = new FaultyFileVolume(
    new NodeFileVolume(
      directory,
      options.realLocations === true ? {} : { rootUri: CONTRACT_DOCUMENTS_URI },
    ),
  );
  const store = createFileStore(
    volume,
    options.timeoutMillis === undefined ? {} : { timeoutMillis: options.timeoutMillis },
  );

  const nameOf = (location: string): string => {
    const name = store.nameOf(location);
    if (name === undefined) throw new Error('The location is no file of the store.');
    return name;
  };

  return {
    store,
    volume,
    files: {
      put: async (location) => {
        const written = await store.write(nameOf(location), CONTENT);
        if (!written.ok) throw new Error('The file could not be put there.');
      },
      exists: async (location) => {
        const stat = await store.stat(nameOf(location));
        return stat.ok && stat.value !== undefined;
      },
      lose: async (location) => {
        await volume.remove(nameOf(location));
      },
      breakDeletion: () => volume.fail('remove', true),
      repairDeletion: () => volume.fail('remove', false),
    },
  };
}
