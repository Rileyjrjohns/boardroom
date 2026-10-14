import { Platform } from 'react-native';

import { createFileStore } from './FileStore';
import type { FileStore } from './FileStore';
import { EXPO_STORAGE, ExpoFileVolume } from './ExpoFileVolume';

/** The directory of the documents, in the storage of the app. Part of what is on the device. */
export const DOCUMENT_DIRECTORY_NAME = 'boardroom-documents';

const IOS = 'ios';

/**
 * Where the content of the documents lives on a phone: the caches directory on iOS, the private
 * storage of the app on Android (see `ExpoFileVolume` for why they differ).
 */
export function createExpoFileStore(): FileStore {
  const storage = Platform.OS === IOS ? EXPO_STORAGE.Cache : EXPO_STORAGE.Private;
  return createFileStore(new ExpoFileVolume(storage, DOCUMENT_DIRECTORY_NAME));
}
