import { render, screen } from '@testing-library/react-native';
import { StatusBar } from 'react-native';

import { statusBarStyle } from '../theme/tokens';

import { AppStatusBar } from './AppStatusBar';

// The content of the system bars (clock, signal, battery) must be dark: the theme is light only,
// and the system's own choice (light on a device in dark mode) hides it on a white header. The
// literal is written here on purpose, so that changing the style is a decision someone reads.
const DARK_CONTENT = 'dark-content';

describe('AppStatusBar', () => {
  it('sets the content of the system bars to dark', () => {
    render(<AppStatusBar />);

    expect(screen.UNSAFE_getByType(StatusBar).props.barStyle).toBe(DARK_CONTENT);
  });

  it('takes the style from the theme', () => {
    render(<AppStatusBar />);

    expect(statusBarStyle).toBe(DARK_CONTENT);
    expect(screen.UNSAFE_getByType(StatusBar).props.barStyle).toBe(statusBarStyle);
  });

  it('sets nothing else: a colour or a translucency is ignored when the app draws edge to edge', () => {
    render(<AppStatusBar />);

    const { props } = screen.UNSAFE_getByType(StatusBar);

    expect(props.backgroundColor).toBeUndefined();
    expect(props.translucent).toBeUndefined();
    expect(props.hidden).toBeUndefined();
  });
});
