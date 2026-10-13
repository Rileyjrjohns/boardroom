import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppServicesProvider, useAppServices } from './AppServices';
import type { AppServices } from './AppServices';

const SERVICES: AppServices = {
  useCases: {
    listMeetings: { execute: () => Promise.reject(new Error('unused')) },
    getMeeting: { execute: () => Promise.reject(new Error('unused')) },
  },
  settings: { meetingsPageSize: 7 },
};

function PageSize() {
  return <Text>{String(useAppServices().settings.meetingsPageSize)}</Text>;
}

describe('AppServicesProvider', () => {
  it('provides the use cases and the settings to the hooks below it', () => {
    render(
      <AppServicesProvider services={SERVICES}>
        <PageSize />
      </AppServicesProvider>,
    );

    expect(screen.getByText('7')).toBeTruthy();
  });

  it('refuses to be read outside of a provider: that is a bug of the tree', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<PageSize />)).toThrow('AppServicesProvider');

    error.mockRestore();
  });
});
