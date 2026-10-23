import { ExpoLocalAuthentication } from './ExpoLocalAuthentication';

// The native module cannot run in Jest, so it is replaced by one that records what it is asked:
// all there is to check in a wrapper that only hands the calls over.
const mockAsked: { call: string; options?: unknown }[] = [];

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: () => {
    mockAsked.push({ call: 'hasHardwareAsync' });
    return Promise.resolve(true);
  },
  isEnrolledAsync: () => {
    mockAsked.push({ call: 'isEnrolledAsync' });
    return Promise.resolve(false);
  },
  authenticateAsync: (options: unknown) => {
    mockAsked.push({ call: 'authenticateAsync', options });
    return Promise.resolve({ success: true });
  },
}));

beforeEach(() => {
  mockAsked.length = 0;
});

describe('ExpoLocalAuthentication', () => {
  it('asks the module about the hardware and the enrolment, and hands the answers over', async () => {
    const platform = new ExpoLocalAuthentication();

    expect(await platform.hasHardware()).toBe(true);
    expect(await platform.isEnrolled()).toBe(false);
    expect(mockAsked).toEqual([{ call: 'hasHardwareAsync' }, { call: 'isEnrolledAsync' }]);
  });

  it('shows the prompt with the options it is given, and nothing else', async () => {
    const options = {
      promptMessage: 'Unlock',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
    } as const;

    const outcome = await new ExpoLocalAuthentication().authenticate(options);

    expect(outcome).toEqual({ success: true });
    expect(mockAsked).toEqual([{ call: 'authenticateAsync', options }]);
  });
});
