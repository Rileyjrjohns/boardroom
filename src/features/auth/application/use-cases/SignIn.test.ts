import { MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { invalidCredentials } from '@features/auth/domain/errors/AuthenticationError';
import { networkUnavailable } from '@core/domain/errors/RepositoryError';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';
import {
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aSession,
  aUser,
  aUserId,
  anEmail,
} from '@testing/domain/builders';

import { DEFAULT_PASSWORD } from '../testing/FakeAuthSession';

import { SignIn } from './SignIn';

describe('SignIn', () => {
  it('signs the user in with validated credentials and returns the session', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;

    const result = await new SignIn(fakes).execute({
      email: '  Alice@Example.com ',
      password: DEFAULT_PASSWORD,
    });

    expect(result).toEqual(ok(aSession()));
    expect(fakes.auth.signInCalls).toEqual([
      { email: anEmail('alice@example.com'), password: DEFAULT_PASSWORD },
    ]);
    expect(fakes.auth.session).toEqual(aSession());
  });

  it('hands the password to the port exactly as typed: the spaces around it count', async () => {
    const fakes = createFakes();
    const bruno = aSession({
      user: aUser({ id: aUserId('user-2'), email: anEmail('bruno@example.com') }),
    });
    fakes.auth.registerAccount(anEmail('bruno@example.com'), '  p4ss word  ', bruno);

    const result = await new SignIn(fakes).execute({
      email: 'bruno@example.com',
      password: '  p4ss word  ',
    });

    expect(result).toEqual(ok(bruno));
    expect(fakes.auth.signInCalls).toEqual([
      { email: anEmail('bruno@example.com'), password: '  p4ss word  ' },
    ]);
  });

  it.each([
    ['a password with its spaces cut', 'p4ss word'],
    ['a password in another case', '  P4SS WORD  '],
  ])('does not sign in with %s', async (_name, password) => {
    const fakes = createFakes();
    fakes.auth.registerAccount(anEmail('bruno@example.com'), '  p4ss word  ', aSession());
    fakes.auth.session = undefined;

    expect(await new SignIn(fakes).execute({ email: 'bruno@example.com', password })).toEqual(
      err(invalidCredentials()),
    );
  });

  it.each([
    [
      'a malformed email',
      { email: 'alice', password: 'secret' },
      VALIDATION_FIELD.Email,
      VALIDATION_RULE.InvalidFormat,
    ],
    [
      'a blank email',
      { email: ' ', password: 'secret' },
      VALIDATION_FIELD.Email,
      VALIDATION_RULE.Required,
    ],
    [
      'an empty password',
      { email: 'alice@example.com', password: '' },
      VALIDATION_FIELD.Password,
      VALIDATION_RULE.Required,
    ],
  ])('rejects %s without calling the server', async (_name, input, field, rule) => {
    const fakes = createFakes();

    expect(await new SignIn(fakes).execute(input)).toEqual(err(validationError(field, rule)));
    expect(fakes.auth.signInCalls).toEqual([]);
  });

  it('returns the refusal of the server for a wrong password', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;

    expect(
      await new SignIn(fakes).execute({ email: 'alice@example.com', password: 'wrong' }),
    ).toEqual(err(invalidCredentials()));
    expect(fakes.auth.session).toBeUndefined();
  });

  it('returns a network failure', async () => {
    const fakes = createFakes();
    fakes.auth.signInFailure = networkUnavailable();

    expect(
      await new SignIn(fakes).execute({ email: 'alice@example.com', password: DEFAULT_PASSWORD }),
    ).toEqual(err(networkUnavailable()));
  });

  describe('the caches and the lock', () => {
    const fill = async (fakes: ReturnType<typeof createFakes>) => {
      await fakes.meetingCache.saveMeeting(aUserId('user-2'), aMeeting(), NOW);
      await fakes.documentCache.save(
        aUserId('user-2'),
        { document: aDocument(), location: aDocumentLocation() },
        NOW,
      );
    };
    const credentials = { email: 'alice@example.com', password: DEFAULT_PASSWORD };

    it('empties both caches once the credentials are accepted: the previous user leaves nothing behind', async () => {
      const fakes = createFakes();
      await fill(fakes);

      await new SignIn(fakes).execute(credentials);

      expect(fakes.meetingCache.isEmpty()).toBe(true);
      expect(fakes.documentCache.isEmpty()).toBe(true);
    });

    it('empties them for every owner, the signed-in user included', async () => {
      const fakes = createFakes();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);

      await new SignIn(fakes).execute(credentials);

      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it.each([
      ['wrong credentials', { email: 'alice@example.com', password: 'wrong' }],
      ['a badly formed email', { email: 'alice', password: DEFAULT_PASSWORD }],
    ])('leaves the caches alone on %s', async (_name, input) => {
      const fakes = createFakes();
      await fill(fakes);

      await new SignIn(fakes).execute(input);

      expect(fakes.meetingCache.isEmpty()).toBe(false);
      expect(fakes.documentCache.isEmpty()).toBe(false);
    });

    it('leaves the caches alone when the server cannot be reached', async () => {
      const fakes = createFakes();
      await fill(fakes);
      fakes.auth.signInFailure = networkUnavailable();

      await new SignIn(fakes).execute(credentials);

      expect(fakes.meetingCache.isEmpty()).toBe(false);
    });

    it('signs in anyway, and captures the failure, when a cache cannot be emptied', async () => {
      const fakes = createFakes();
      await fill(fakes);
      fakes.documentCache.purgeFailure = storageWriteFailed();

      const result = await new SignIn(fakes).execute(credentials);

      expect(result.ok).toBe(true);
      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CachePurgeFailed]);
    });

    it('leaves the app unlocked after a sign-in: the credentials just typed are the proof of presence', async () => {
      const fakes = createFakes();
      fakes.appLock.lock();

      await new SignIn(fakes).execute(credentials);

      expect(fakes.appLock.isLocked()).toBe(false);
    });

    it('keeps the app locked when the sign-in is refused', async () => {
      const fakes = createFakes();
      fakes.appLock.lock();

      await new SignIn(fakes).execute({ email: 'alice@example.com', password: 'wrong' });

      expect(fakes.appLock.isLocked()).toBe(true);
    });

    it('is locked while the caches are emptied, and opened only afterwards', async () => {
      const fakes = createFakes();
      const seen: boolean[] = [];
      const purge = fakes.meetingCache.purge.bind(fakes.meetingCache);
      fakes.meetingCache.purge = () => {
        seen.push(fakes.appLock.isLocked());
        return purge();
      };

      await new SignIn(fakes).execute(credentials);

      expect(seen).toEqual([true]);
      expect(fakes.appLock.isLocked()).toBe(false);
    });
  });
});
