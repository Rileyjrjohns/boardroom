import { VALIDATION_FIELD } from '@domain/errors/ValidationError';
import { NOW, aUser, aSession, anEmail, unwrap } from '@domain/testing/builders';
import { parseInstant } from '@domain/value-objects/Instant';

import {
  MAX_SESSION_LIFETIME_SECONDS,
  signInRequestSchema,
  signInResponseSchema,
  toSignInRequestWire,
  toSignInResponseWire,
  toSignedIn,
} from './sessionDto';

const RESPONSE = toSignInResponseWire({ token: 'a-token', session: aSession() }, 3600);

describe('the sign-in schemas', () => {
  it('reads a response and ignores the fields it does not know', () => {
    const parsed = signInResponseSchema.parse({
      ...RESPONSE,
      refreshToken: 'ignored',
      user: { ...RESPONSE.user, role: 'x' },
    });

    expect(parsed.accessToken).toBe('a-token');
    expect(parsed).not.toHaveProperty('refreshToken');
  });

  it.each(['accessToken', 'tokenType', 'expiresIn', 'user'])(
    'fails when %s is missing',
    (field) => {
      const { [field as keyof typeof RESPONSE]: _removed, ...rest } = RESPONSE;

      expect(signInResponseSchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each(['id', 'fullName', 'email'])('fails when the user has no %s', (field) => {
    const { [field as keyof typeof RESPONSE.user]: _removed, ...user } = RESPONSE.user;

    expect(signInResponseSchema.safeParse({ ...RESPONSE, user }).success).toBe(false);
  });

  it.each([
    ['an empty token', { accessToken: '' }],
    ['a token that is a number', { accessToken: 12 }],
    ['a token type that is not Bearer', { tokenType: 'Basic' }],
    ['a lifetime that is text', { expiresIn: '3600' }],
    ['a lifetime beyond the maximum', { expiresIn: MAX_SESSION_LIFETIME_SECONDS + 1 }],
    ['a token with a space', { accessToken: 'two words' }],
    ['a token with a line break', { accessToken: 'abc\r\nX-Injected: 1' }],
    ['a token with a control character', { accessToken: 'abc\u0007' }],
    ['a token with a character that is not ASCII', { accessToken: 'jeton-\u00e9' }],
    ['a token with a tab', { accessToken: 'abc\tdef' }],
    ['a token that is too long', { accessToken: 'a'.repeat(4097) }],
  ])('fails for %s', (_name, change) => {
    expect(signInResponseSchema.safeParse({ ...RESPONSE, ...change }).success).toBe(false);
  });

  it.each([
    ['the longest lifetime', { expiresIn: MAX_SESSION_LIFETIME_SECONDS }],
    ['a token of every visible character', { accessToken: '!~09azAZ._-+/=' }],
    ['the longest token', { accessToken: 'a'.repeat(4096) }],
  ])('accepts %s', (_name, change) => {
    expect(signInResponseSchema.safeParse({ ...RESPONSE, ...change }).success).toBe(true);
  });

  it('writes the request with the email and the password as typed, and reads it back', () => {
    const wire = toSignInRequestWire({ email: anEmail(), password: ' pass word ' });

    expect(wire).toEqual({ email: 'alice@example.com', password: ' pass word ' });
    expect(signInRequestSchema.parse(wire)).toEqual(wire);
    expect(signInRequestSchema.safeParse({ email: 'a@b.cd' }).success).toBe(false);
  });
});

describe('toSignedIn', () => {
  it('builds the session on the clock of the device from the lifetime the server grants', () => {
    const signedIn = toSignedIn(signInResponseSchema.parse(RESPONSE), NOW);

    expect(signedIn).toStrictEqual({
      ok: true,
      value: { token: 'a-token', session: { user: aUser(), expiresAt: NOW + 3_600_000 } },
    });
  });

  it('does not copy any timestamp of the server', () => {
    const wire = signInResponseSchema.parse({ ...RESPONSE, expiresAt: '1999-01-01T00:00:00Z' });

    const signedIn = toSignedIn(wire, NOW);

    expect(signedIn.ok && signedIn.value.session.expiresAt).toBe(NOW + 3_600_000);
  });

  it('accepts a lifetime of zero: a session that is already over', () => {
    const signedIn = toSignedIn(signInResponseSchema.parse({ ...RESPONSE, expiresIn: 0 }), NOW);

    expect(signedIn.ok && signedIn.value.session.expiresAt).toBe(NOW);
  });

  it.each([
    ['a blank id', { id: ' ' }, VALIDATION_FIELD.UserId],
    ['an email that is not one', { email: 'nobody' }, VALIDATION_FIELD.Email],
    ['a blank name', { fullName: '  ' }, VALIDATION_FIELD.FullName],
  ])('refuses a user with %s through the factories of the domain', (_name, change, field) => {
    const wire = signInResponseSchema.parse({ ...RESPONSE, user: { ...RESPONSE.user, ...change } });

    const signedIn = toSignedIn(wire, NOW);

    expect(!signedIn.ok && signedIn.error).toMatchObject({ field });
  });

  it.each([
    ['a negative lifetime', -1],
    ['a lifetime that is not whole', 1.0000001],
  ])('refuses %s', (_name, expiresIn) => {
    expect(toSignedIn(signInResponseSchema.parse({ ...RESPONSE, expiresIn }), NOW).ok).toBe(false);
  });

  it('refuses a session that would end beyond the range of an instant', () => {
    const lastInstant = unwrap(parseInstant(8_640_000_000_000_000));

    const signedIn = toSignedIn(signInResponseSchema.parse(RESPONSE), lastInstant);

    expect(signedIn.ok).toBe(false);
  });
});
