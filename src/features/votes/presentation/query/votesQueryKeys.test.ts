import { votesQueryKeys } from './votesQueryKeys';

describe('votesQueryKeys', () => {
  it('builds the key of the outbox', () => {
    expect(votesQueryKeys.pending()).toEqual(['votes', 'pending']);
  });

  it('builds a new key at every call, so that a key can never be changed under another caller', () => {
    expect(votesQueryKeys.pending()).not.toBe(votesQueryKeys.pending());
  });
});
