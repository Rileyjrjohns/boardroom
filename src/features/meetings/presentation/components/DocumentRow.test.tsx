import { fireEvent, screen, within } from '@testing-library/react-native';

import { colors, touchTarget } from '@core/presentation/theme/tokens';
import { CONFIDENTIALITY_LEVEL } from '@features/meetings/domain/entities/Document';
import { aDocument, aDocumentId } from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';

import { DocumentRow } from './DocumentRow';
import { documentTestId } from '../testIds';

function renderDocument(overrides: Parameters<typeof aDocument>[0], language: 'en' | 'fr' = 'en') {
  const document = aDocument({ id: aDocumentId('doc'), ...overrides });
  const onOpen = jest.fn();
  const rendered = renderScreen(<DocumentRow document={document} onOpen={onOpen} />, { language });
  return { ...rendered, onOpen, document, row: screen.getByTestId(documentTestId(document.id)) };
}

describe('DocumentRow', () => {
  describe('as a button', () => {
    it('opens its document when it is pressed', () => {
      const { onOpen, row } = renderDocument({});

      fireEvent.press(row);

      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledWith('doc');
    });

    it('is a button for the screen reader, named by its title, its level and its pages, with a hint', () => {
      const { t, row } = renderDocument({ title: 'Board pack', pageCount: 4 });

      expect(
        screen.getByRole('button', {
          name: `Board pack, ${t('confidentiality.internal')}, 4 pages`,
        }),
      ).toBe(row);
      expect(row.props.accessibilityHint).toBe(t('meeting.openDocumentHint'));
    });

    it('is named in French in French, with the number of pages written the French way', () => {
      const { t, row } = renderDocument({ title: 'Dossier', pageCount: 1234 }, 'fr');

      expect(row.props.accessibilityLabel).toMatch(
        new RegExp(`^Dossier, ${t('confidentiality.internal')}, 1[\\u202f\\u00a0 ]234 pages$`),
      );
      expect(row.props.accessibilityHint).toBe('Ouvre le document');
    });

    it('is at least as tall as a touch target', () => {
      const { row } = renderDocument({});

      expect(row).toHaveStyle({ minHeight: touchTarget.min });
    });
  });

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
