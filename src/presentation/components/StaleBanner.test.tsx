import { screen } from '@testing-library/react-native';

import { MILLIS_PER_DAY, NOW, at } from '@domain/testing/builders';

import { TEST_IDS } from '../testIds';
import { renderScreen } from '../testing/renderScreen';

import { StaleBanner } from './StaleBanner';

describe('StaleBanner', () => {
  it('says in English that saved data is shown, and since when', () => {
    const { format } = renderScreen(<StaleBanner cachedAt={NOW} />, { language: 'en' });

    expect(screen.getByTestId(TEST_IDS.staleBanner)).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Showing saved data from ${format.dateTime(NOW)}`,
    );
  });

  it('says in French that saved data is shown, and since when', () => {
    const { format } = renderScreen(<StaleBanner cachedAt={NOW} />, { language: 'fr' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      `Affichage des données enregistrées le ${format.dateTime(NOW)}`,
    );
  });

  it('dates the copy it is given, not the present', () => {
    const earlier = at(-3 * MILLIS_PER_DAY);
    const { format } = renderScreen(<StaleBanner cachedAt={earlier} />);

    expect(screen.getByText(`Showing saved data from ${format.dateTime(earlier)}`)).toBeTruthy();
    expect(screen.queryByText(new RegExp(format.dateTime(NOW)))).toBeNull();
  });
});
