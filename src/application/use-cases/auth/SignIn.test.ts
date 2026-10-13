import { invalidCredentials } from '@domain/errors/AuthenticationError';
import { networkUnavailable } from '@domain/errors/RepositoryError';
import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '@domain/errors/ValidationError';
import { err, ok } from '@domain/shared/Result';
import { aSession, aUser, aUserId, anEmail } from '@domain/testing/builders';

import { createFakes } from '../../testing/createFakes';
import { DEFAULT_PASSWORD } from '../../testing/FakeAuthSession';

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
});
