import { z } from 'zod';

import { createSession } from '@domain/entities/Session';
import type { Session } from '@domain/entities/Session';
import { createUser } from '@domain/entities/User';
import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { andThen, err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseEmailAddress } from '@domain/value-objects/EmailAddress';
import { parseUserId } from '@domain/value-objects/ids';
import { parseInstant } from '@domain/value-objects/Instant';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import type { Monitoring } from '@application/ports/Monitoring';

import type { BearerTokenSource } from '../http/HttpClient';
import type { SignedIn } from '../http/dto/sessionDto';
import { attempt } from '../shared/attempt';

import { SECURE_STORAGE_KEY } from './SecureStorage';
import type { SecureStorage } from './SecureStorage';

/** How long the keychain may take to answer before the call is a storage failure. */
const DEFAULT_STORAGE_TIMEOUT_MILLIS = 10_000;

/** What the session is called in the logs. */
const SESSION_RESOURCE = 'session';

const CAUSE = {
  Unreadable: 'session unreadable',
} as const;

/** The session and its token as they are kept: one item, so that a replacement is one write. */
const storedSessionSchema = z.object({
  token: z.string().min(1),
  user: z.object({ id: z.string(), fullName: z.string(), email: z.string() }),
  expiresAt: z.number(),
});

type StoredSession = z.input<typeof storedSessionSchema>;

interface Held {
  readonly session: Session;
  readonly token: string;
}

export interface SessionVaultOptions {
  readonly storage: SecureStorage;
  readonly monitoring: Monitoring;
  /** Defaults to `DEFAULT_STORAGE_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/**
 * The session of the signed-in user and the token that proves it, kept in the secure storage of
 * the device and read from memory once it has been loaded. It is what `HttpAuthSession` writes
 * and what the HTTP client reads the token from, when it creates a request.
 *
 * - One item holds the session and the token, so replacing it is one write: there is no instant at
 *   which the storage holds the token of a user and the session of another, or none while a
 *   sign-in succeeds. The memory follows the storage: it changes only once the write succeeded, so
 *   a write that fails leaves the session as it was.
 * - Every operation goes through one queue, so that the order in which sign-ins and sign-outs were
 *   asked is the order they happen in, and the memory cannot end up with a session the storage
 *   does not hold.
 * - A stored item that no longer reads back (the format changed, the storage was tampered with) is
 *   treated as nobody being signed in: it is captured by the monitoring, without its content, and
 *   deleted.
 * - Signing out empties the memory first, then the storage: whatever happens to the storage, the
 *   token is no longer used. A storage that cannot forget reports it, and signing out can be
 *   tried again.
 */
export class SessionVault implements BearerTokenSource {
  private held: Held | undefined;
  private loaded = false;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: SessionVaultOptions) {}

  async session(): Promise<Result<Session | undefined, StorageReadFailedError>> {
    return this.serial(async () => {
      const loaded = await this.load();
      return loaded.ok ? ok(this.held?.session) : loaded;
    });
  }

  async token(): Promise<Result<string | undefined, StorageReadFailedError>> {
    return this.serial(async () => {
      const loaded = await this.load();
      return loaded.ok ? ok(this.held?.token) : loaded;
    });
  }

  /** Stores the session and its token in place of any other. Nothing changes if the write fails. */
  async replace(signedIn: SignedIn): Promise<Result<void, StorageWriteFailedError>> {
    return this.serial(async () => {
      const { session, token } = signedIn;
      const written = await attempt(
        () => this.options.storage.set(SECURE_STORAGE_KEY.Session, serialise(session, token)),
        this.timeout(),
      );
      if (!written.ok) return err(storageWriteFailed(written.error.cause));
      this.held = { session, token };
      this.loaded = true;
      return ok(undefined);
    });
  }

  /** Forgets the session and its token. Succeeds when there was none. */
  async clear(): Promise<Result<void, StorageWriteFailedError>> {
    return this.serial(async () => {
      this.held = undefined;
      this.loaded = true;
      const removed = await attempt(
        () => this.options.storage.remove(SECURE_STORAGE_KEY.Session),
        this.timeout(),
      );
      return removed.ok ? ok(undefined) : err(storageWriteFailed(removed.error.cause));
    });
  }

  private timeout(): number {
    return this.options.timeoutMillis ?? DEFAULT_STORAGE_TIMEOUT_MILLIS;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Reads the storage the first time (and again after a read that failed). */
  private async load(): Promise<Result<void, StorageReadFailedError>> {
    if (this.loaded) return ok(undefined);
    const read = await attempt(
      () => this.options.storage.get(SECURE_STORAGE_KEY.Session),
      this.timeout(),
    );
    if (!read.ok) return err(storageReadFailed(read.error.cause));

    this.held = read.value === undefined ? undefined : await this.restore(read.value);
    this.loaded = true;
    return ok(undefined);
  }

  /** The session an item holds, or nothing and the item dropped when it no longer reads back. */
  private async restore(raw: string): Promise<Held | undefined> {
    const restored = deserialise(raw);
    if (restored !== undefined) return restored;

    this.options.monitoring.captureError(
      MONITORING_EVENT.StoredRowDiscarded,
      storageReadFailed(CAUSE.Unreadable),
      { [LOG_ATTRIBUTE.Resource]: SESSION_RESOURCE },
    );
    // Best effort: the item is not used either way.
    await attempt(() => this.options.storage.remove(SECURE_STORAGE_KEY.Session), this.timeout());
    return undefined;
  }
}

function serialise(session: Session, token: string): string {
  const stored: StoredSession = {
    token,
    user: { id: session.user.id, fullName: session.user.fullName, email: session.user.email },
    expiresAt: session.expiresAt,
  };
  return JSON.stringify(stored);
}

/** The session and the token an item holds, or `undefined` when it no longer reads back. */
function deserialise(raw: string): Held | undefined {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = storedSessionSchema.safeParse(json);
  if (!parsed.success) return undefined;

  const { token, user, expiresAt } = parsed.data;
  const restored = andThen(parseUserId(user.id), (id) =>
    andThen(parseEmailAddress(user.email), (email) =>
      andThen(createUser({ id, fullName: user.fullName, email }), (valid) =>
        andThen(parseInstant(expiresAt), (instant) =>
          ok({ token, session: createSession({ user: valid, expiresAt: instant }) }),
        ),
      ),
    ),
  );
  return restored.ok ? restored.value : undefined;
}
