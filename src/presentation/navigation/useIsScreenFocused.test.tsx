import { NavigationContext } from 'expo-router/react-navigation';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useIsScreenFocused } from './useIsScreenFocused';

// Whether a screen is the one on top of its navigator. The real navigator is used by the scenario
// tests; this is the hook on its own, with a navigation object that says what it is told.

type Listener = () => void;

/** The part of a navigation object that the hook uses. */
function aNavigation(focused: boolean) {
  const listeners = new Map<string, Set<Listener>>();
  const state = { focused };
  return {
    isFocused: () => state.focused,
    addListener: (event: string, listener: Listener) => {
      const forEvent = listeners.get(event) ?? new Set<Listener>();
      forEvent.add(listener);
      listeners.set(event, forEvent);
      return () => {
        forEvent.delete(listener);
      };
    },
    emit: (event: 'focus' | 'blur') => {
      state.focused = event === 'focus';
      for (const listener of [...(listeners.get(event) ?? [])]) listener();
    },
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

function inside(navigation: ReturnType<typeof aNavigation>) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <NavigationContext.Provider value={navigation as never}>
        {children}
      </NavigationContext.Provider>
    );
  };
}

describe('useIsScreenFocused', () => {
  it('is true outside of any navigator: there is no screen to be behind another', () => {
    const { result } = renderHook(() => useIsScreenFocused());

    expect(result.current).toBe(true);
  });

  it('follows the screen as the user leaves it and comes back', () => {
    const navigation = aNavigation(true);
    const { result } = renderHook(() => useIsScreenFocused(), { wrapper: inside(navigation) });
    expect(result.current).toBe(true);

    act(() => navigation.emit('blur'));
    expect(result.current).toBe(false);

    act(() => navigation.emit('focus'));
    expect(result.current).toBe(true);
  });

  it('starts false for a screen that is below another when it is mounted', () => {
    const navigation = aNavigation(false);

    const { result } = renderHook(() => useIsScreenFocused(), { wrapper: inside(navigation) });

    expect(result.current).toBe(false);
  });

  it('stops listening when the screen is unmounted', () => {
    const navigation = aNavigation(true);
    const { unmount } = renderHook(() => useIsScreenFocused(), { wrapper: inside(navigation) });
    expect(navigation.listenerCount()).toBe(2);

    unmount();

    expect(navigation.listenerCount()).toBe(0);
  });
});
