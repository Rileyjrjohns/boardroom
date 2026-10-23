import { render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { useAnnounce } from './useAnnounce';

// What is said to the screen reader, and by which platform: iOS announces, Android has live regions
// on the texts themselves. Which screen says it is tested with the navigator (`offlineScenario`).

const MESSAGE = 'You are offline';
const OTHER = 'Back online';

function Announcer({ message }: { readonly message: string | undefined }) {
  useAnnounce(message);
  return null;
}

function spyOnAnnouncements(): jest.SpyInstance {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  announce.mockClear();
  return announce;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAnnounce', () => {
  describe('on iOS', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'ios');
    });

    it('announces a message when it appears', () => {
      const announce = spyOnAnnouncements();

      render(<Announcer message={MESSAGE} />);

      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(MESSAGE);
    });

    it('announces it again when it changes, and not when it is rendered again unchanged', () => {
      const announce = spyOnAnnouncements();
      const { rerender } = render(<Announcer message={MESSAGE} />);

      rerender(<Announcer message={MESSAGE} />);
      rerender(<Announcer message={OTHER} />);

      expect(announce.mock.calls).toEqual([[MESSAGE], [OTHER]]);
    });

    it('announces nothing for no message, and announces the message again when it comes back', () => {
      const announce = spyOnAnnouncements();
      const { rerender } = render(<Announcer message={undefined} />);
      expect(announce).not.toHaveBeenCalled();

      rerender(<Announcer message={MESSAGE} />);
      rerender(<Announcer message={undefined} />);
      rerender(<Announcer message={MESSAGE} />);

      expect(announce.mock.calls).toEqual([[MESSAGE], [MESSAGE]]);
    });
  });

  it('announces nothing on Android, where the live region of the text does it', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = spyOnAnnouncements();

    render(<Announcer message={MESSAGE} />);

    expect(announce).not.toHaveBeenCalled();
  });
});
