/**
 * A small key-value store for secrets (a session token, the key of the database). On a device it
 * is the keychain (iOS) or the keystore (Android). It is the seam between the logic that decides
 * what to keep and the native module that keeps it, so the logic is tested against an in-memory
 * one. The methods may reject: the callers turn that into the errors of their ports.
 */
export interface SecureStorage {
  /** The value stored under the key, or `undefined`. */
  get(key: string): Promise<string | undefined>;
  /** Stores the value, replacing what the key held. */
  set(key: string, value: string): Promise<void>;
  /** Forgets the key. Forgetting a key that is not there succeeds. */
  remove(key: string): Promise<void>;
}

/**
 * The keys of the secure storage. Letters, digits, dots, dashes and underscores only: that is what
 * both platforms accept.
 */
export const SECURE_STORAGE_KEY = {
  Session: 'boardroom.session',
  DatabaseKey: 'boardroom.database-key',
} as const;
