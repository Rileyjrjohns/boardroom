import { ExpoSecureStorage } from './ExpoSecureStorage';

// The native keychain cannot run in Jest, so the module that wraps it is replaced by one that
// records what it is asked: the only thing left to check in a wrapper this thin.
const mockCalls: { method: string; args: unknown[] }[] = [];
const mockItems = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: (...args: unknown[]) => {
    mockCalls.push({ method: 'getItemAsync', args });
    return Promise.resolve(mockItems.get(String(args[0])) ?? null);
  },
  setItemAsync: (...args: unknown[]) => {
    mockCalls.push({ method: 'setItemAsync', args });
    mockItems.set(String(args[0]), String(args[1]));
    return Promise.resolve();
  },
  deleteItemAsync: (...args: unknown[]) => {
    mockCalls.push({ method: 'deleteItemAsync', args });
    mockItems.delete(String(args[0]));
    return Promise.resolve();
  },
}));

const DEVICE_ONLY = {
  keychainService: 'boardroom',
  keychainAccessible: 6,
  requireAuthentication: false,
};

beforeEach(() => {
  mockCalls.length = 0;
  mockItems.clear();
});

describe('ExpoSecureStorage', () => {
  it('stores and reads a value, with the item kept on this device only', async () => {
    const storage = new ExpoSecureStorage();

    await storage.set('a.key', 'a value');

    expect(await storage.get('a.key')).toBe('a value');
    expect(mockCalls).toEqual([
      { method: 'setItemAsync', args: ['a.key', 'a value', DEVICE_ONLY] },
      { method: 'getItemAsync', args: ['a.key', DEVICE_ONLY] },
    ]);
  });

  it('reads a key that is not there as undefined', async () => {
    expect(await new ExpoSecureStorage().get('missing')).toBeUndefined();
  });

  it('forgets a key, with the same options', async () => {
    const storage = new ExpoSecureStorage();
    await storage.set('a.key', 'a value');

    await storage.remove('a.key');

    expect(await storage.get('a.key')).toBeUndefined();
    expect(mockCalls).toContainEqual({ method: 'deleteItemAsync', args: ['a.key', DEVICE_ONLY] });
  });
});
