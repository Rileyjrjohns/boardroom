import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { NOW } from '@testing/domain/builders';

import { useFormatters } from '../format/FormattersProvider';
import type { Formatters } from '../format/formatters';

import { I18nProvider } from './I18nProvider';
import { setDeviceLanguages } from './testing/setDeviceLanguages';

// The formatters the provider gives are made once for a locale and shared, not made again by each
// component that formats something.

const seen: Formatters[] = [];

function Probe({ id }: { readonly id: string }) {
  const formatters = useFormatters();
  seen.push(formatters);
  return <Text testID={id}>{formatters.number(1234.5)}</Text>;
}

beforeEach(() => {
  seen.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the formatters of I18nProvider', () => {
  it('are one set, shared by every component below', () => {
    render(
      <I18nProvider>
        <Probe id="a" />
        <Probe id="b" />
        <Probe id="c" />
      </I18nProvider>,
    );

    expect(new Set(seen).size).toBe(1);
  });

  it('are kept when the tree is rendered again', () => {
    const { rerender } = render(
      <I18nProvider>
        <Probe id="a" />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider>
        <Probe id="a" />
      </I18nProvider>,
    );

    expect(new Set(seen).size).toBe(1);
  });

  it('are made again when the locale changes, and only then', () => {
    setDeviceLanguages('en-US');
    const { rerender } = render(
      <I18nProvider>
        <Probe id="a" />
      </I18nProvider>,
    );
    setDeviceLanguages('en-GB');

    rerender(
      <I18nProvider>
        <Probe id="a" />
      </I18nProvider>,
    );

    expect(new Set(seen).size).toBe(2);
  });

  it('are for the region of the device when it is in the language shown', () => {
    setDeviceLanguages('en-GB');

    render(
      <I18nProvider>
        <Probe id="a" />
      </I18nProvider>,
    );

    expect(NOW).toBeGreaterThan(0);
    expect(seen[0]?.dateTime(NOW)).not.toBe(
      new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(NOW)),
    );
    expect(screen.getByTestId('a')).toHaveTextContent('1,234.5');
  });

  it('are for the bare language when the language shown is not the one of the device', () => {
    setDeviceLanguages('en-GB');

    render(
      <I18nProvider language="fr">
        <Probe id="a" />
      </I18nProvider>,
    );

    expect(screen.getByTestId('a').props.children).toMatch(/^1[\u202f\u00a0 ]234,5$/);
  });

  it('are refused outside of a provider: that is a bug of the tree', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe id="a" />)).toThrow('FormattersProvider');
  });
});
