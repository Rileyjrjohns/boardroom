import { sessionQueryKeys } from './sessionQueryKeys';

describe('sessionQueryKeys', () => {
  it('builds the key of the signed-in user', () => {
    expect(sessionQueryKeys.user()).toEqual(['session', 'user']);
  });

  it('builds a new key at every call, so that a key can never be changed under another caller', () => {
    expect(sessionQueryKeys.user()).not.toBe(sessionQueryKeys.user());
  });
});
