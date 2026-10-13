import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import { useAnnounce } from '../accessibility/useAnnounce';

interface LiveTextProps {
  /** The translated text. */
  readonly message: string;
  readonly style?: StyleProp<TextStyle>;
  readonly testID?: string;
}

/**
 * A text that appears while the user is looking at something else: an error, a notice that the
 * data is a saved copy. It is an alert for the screen reader, a polite live region on Android
 * (TalkBack reads it when it shows up or changes) and an announcement on iOS (see `useAnnounce`).
 * The one place that does so, so that a message that matters is never silent for some users.
 */
export function LiveText({ message, style, testID }: LiveTextProps) {
  useAnnounce(message);

  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={style}
      {...(testID === undefined ? {} : { testID })}
    >
      {message}
    </Text>
  );
}
