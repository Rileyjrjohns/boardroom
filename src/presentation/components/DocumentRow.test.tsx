import { screen, within } from '@testing-library/react-native';

import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { aDocument, aDocumentId } from '@domain/testing/builders';

import { documentTestId } from '../testIds';
import { renderScreen } from '../testing/renderScreen';
import { colors } from '../theme/tokens';

import { DocumentRow } from './DocumentRow';

function renderDocument(overrides: Parameters<typeof aDocument>[0], language: 'en' | 'fr' = 'en') {
  const document = aDocument({ id: aDocumentId('doc'), ...overrides });
  const rendered = renderScreen(<DocumentRow document={document} />, { language });
  return { ...rendered, row: screen.getByTestId(documentTestId(document.id)) };
}

describe('DocumentRow', () => {
  it('shows the title, the confidentiality and the number of pages', () => {
    const { t, row } = renderDocument({ title: 'Board pack', pageCount: 4 });

    expect(within(row).getByText('Board pack')).toBeTruthy();
    expect(within(row).getByText(t('confidentiality.internal'))).toBeTruthy();
    expect(within(row).getByText('4 pages')).toBeTruthy();
  });

  it('marks a confidential document in red', () => {
    const { t, row } = renderDocument({ confidentiality: CONFIDENTIALITY_LEVEL.Confidential });

    expect(within(row).getByText(t('confidentiality.confidential'))).toHaveStyle({
      color: colors.confidentialBadgeText,
    });
  });

  it.each([CONFIDENTIALITY_LEVEL.Public, CONFIDENTIALITY_LEVEL.Internal])(
    'marks a %s document in neutral',
    (confidentiality) => {
      const { t, row } = renderDocument({ confidentiality });

      expect(within(row).getByText(t(`confidentiality.${confidentiality}`))).toHaveStyle({
        color: colors.neutralBadgeText,
      });
    },
  );

  describe('the number of pages', () => {
    it('is written with the grouping of the language', () => {
      const english = renderDocument({ pageCount: 1234 });
      expect(within(english.row).getByText('1,234 pages')).toBeTruthy();
    });

    it('is written the French way in French', () => {
      const { row } = renderDocument({ pageCount: 1234 }, 'fr');

      expect(within(row).getByText(/^1[\u202f\u00a0 ]234 pages$/)).toBeTruthy();
    });

    it('says one page for one', () => {
      const { row } = renderDocument({ pageCount: 1 });

      expect(within(row).getByText('1 page')).toBeTruthy();
    });
  });
});
