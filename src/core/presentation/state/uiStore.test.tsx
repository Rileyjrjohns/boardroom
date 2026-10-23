import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';

import { UiStoreProvider, createUiStore, useUiStore, useUiStoreApi } from './uiStore';

describe('createUiStore', () => {
  it('starts online, uncovered and with no reset to tell', () => {
    const state = createUiStore().getState();

    expect(state.connectivity).toBe(CONNECTIVITY_STATUS.Online);
    expect(state.privacyCover).toBe(false);
    expect(state.localDataResetNotice).toBe(false);
  });

  it('keeps what it is told about the connection and the cover', () => {
    const store = createUiStore();

    store.getState().setConnectivity(CONNECTIVITY_STATUS.Offline);
    store.getState().setPrivacyCover(true);

    expect(store.getState().connectivity).toBe(CONNECTIVITY_STATUS.Offline);
    expect(store.getState().privacyCover).toBe(true);
  });

  it('tells the user a reset happened until they have read it', () => {
    const store = createUiStore({ localDataReset: true });
    expect(store.getState().localDataResetNotice).toBe(true);

    store.getState().dismissLocalDataReset();

    expect(store.getState().localDataResetNotice).toBe(false);
  });

  it('notifies its subscribers of a change', () => {
    const store = createUiStore();
    const covers: boolean[] = [];
    store.subscribe((state) => covers.push(state.privacyCover));

    store.getState().setPrivacyCover(true);

    expect(covers).toEqual([true]);
  });

  it('creates a new store at every call: no state is shared between two', () => {
    const first = createUiStore();
    const second = createUiStore();

    first.getState().setPrivacyCover(true);

    expect(second.getState().privacyCover).toBe(false);
  });
});

const FIRST = 'a';
const SECOND = 'b';

function Cover({ label }: { readonly label: string }) {
  const covered = useUiStore((state) => state.privacyCover);
  const setCovered = useUiStore((state) => state.setPrivacyCover);
  const text = `${label}: ${covered ? 'covered' : 'uncovered'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        setCovered(true);
      }}
    >
      <Text>{text}</Text>
    </Pressable>
  );
}

describe('UiStoreProvider', () => {
  it('provides a store to the tree below, and re-renders it when the state changes', () => {
    render(
      <UiStoreProvider>
        <Cover label={FIRST} />
      </UiStoreProvider>,
    );
    expect(screen.getByText('a: uncovered')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: covered')).toBeTruthy();
  });

  it('shares one store between the components below it', () => {
    render(
      <UiStoreProvider>
        <Cover label={FIRST} />
        <Cover label={SECOND} />
      </UiStoreProvider>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('b: covered')).toBeTruthy();
  });

  it('provides the store it is given, so that what is outside React and what is inside see one', () => {
    const store = createUiStore();
    store.getState().setPrivacyCover(true);

    render(
      <UiStoreProvider store={store}>
        <Cover label={FIRST} />
      </UiStoreProvider>,
    );

    expect(screen.getByText('a: covered')).toBeTruthy();
    act(() => {
      store.getState().setPrivacyCover(false);
    });
    expect(screen.getByText('a: uncovered')).toBeTruthy();
  });

  it('gives each provider its own store, so that two apps never share state', () => {
    render(
      <>
        <UiStoreProvider>
          <Cover label={FIRST} />
        </UiStoreProvider>
        <UiStoreProvider>
          <Cover label={SECOND} />
        </UiStoreProvider>
      </>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: covered')).toBeTruthy();
    expect(screen.getByText('b: uncovered')).toBeTruthy();
  });

  it('keeps its store when the tree below it is rendered again', () => {
    const { rerender } = render(
      <UiStoreProvider>
        <Cover label={FIRST} />
      </UiStoreProvider>,
    );
    fireEvent.press(screen.getByLabelText(FIRST));

    rerender(
      <UiStoreProvider>
        <Cover label={FIRST} />
      </UiStoreProvider>,
    );

    expect(screen.getByText('a: covered')).toBeTruthy();
    act(() => undefined);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree, not a state', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Cover label={FIRST} />)).toThrow('UiStoreProvider');

    error.mockRestore();
  });

  it('gives the store itself to code that reads it when an event fires, and refuses outside a provider', () => {
    const store = createUiStore();
    const given: unknown[] = [];
    function Probe() {
      given.push(useUiStoreApi());
      return null;
    }
    render(
      <UiStoreProvider store={store}>
        <Probe />
      </UiStoreProvider>,
    );
    expect(given[0]).toBe(store);

    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('UiStoreProvider');
    error.mockRestore();
  });
});
