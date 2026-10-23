import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { createI18n } from '@core/presentation/i18n/createI18n';
import { setDeviceLanguages } from '@core/presentation/i18n/testing/setDeviceLanguages';
import {
  pdfProps,
  resetPdfStub,
} from '@features/documents/presentation/testing/reactNativePdfStub';
import { MEETING_ROW_TEST_ID_PATTERN } from '@features/meetings/presentation/testing/meetingFixtures';
import { AUTH_TEST_IDS } from '@features/auth/presentation/testIds';
import { DOCUMENTS_TEST_IDS } from '@features/documents/presentation/testIds';
import { MEETINGS_TEST_IDS } from '@features/meetings/presentation/testIds';
import { demoAccountTestId, CORE_TEST_IDS } from '@core/presentation/testIds';

// Opening a document through the real root layout, the real route files and the real composition
// root in its mock configuration: the simulated server makes a PDF for the document, the repository
// writes it to a file through the real `ExpoFileVolume` (over the in-memory file system that
// jest-expo gives `expo-file-system`), and the viewer is handed that file. Only the language of the
// device and the environment are set by the test, and the PDF view, which needs a phone.

const initial = process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
const ALICE = 'alice.martin@boardroom.example';
/** Where jest-expo's file system puts the caches directory, and the directory of the documents. */
const DOCUMENTS_DIRECTORY = 'file:///mock/cache/boardroom-documents/';

beforeEach(() => {
  resetPdfStub();
  // The real composition root writes its events to the console, at the level of information.
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (initial === undefined) delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
  else process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = initial;
});

async function signIn(): Promise<void> {
  fireEvent.press(await screen.findByTestId(demoAccountTestId(ALICE)));
  fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signInSubmit));
}

/** Signs in, and opens meetings in turn until one has a confidential document; returns its row. */
async function openAMeetingWithAConfidentialDocument(t: ReturnType<typeof createI18n>['t']) {
  await signIn();
  const rows = await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
  for (const row of rows.slice(0, 8)) {
    fireEvent.press(row);
    await screen.findByTestId(MEETINGS_TEST_IDS.meetingDetail);
    const confidential = screen
      .queryAllByTestId(/^document-/)
      .find((document) => within(document).queryByText(t('confidentiality.confidential')) !== null);
    if (confidential !== undefined) return confidential;
    act(() => {
      router.back();
    });
    await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
  }
  throw new Error('No meeting of the first page has a confidential document.');
}

describe('a document, with the real composition root', () => {
  it.each(['en', 'fr'] as const)(
    'opens from its row, protected and watermarked with the reader, on a file of the device, in %s',
    async (language) => {
      setDeviceLanguages(language);
      const { t } = createI18n(language);
      const { getPathname } = renderRouter();
      const row = await openAMeetingWithAConfidentialDocument(t);

      fireEvent.press(row);

      await screen.findByTestId(DOCUMENTS_TEST_IDS.documentPdf);
      expect(getPathname()).toMatch(/^\/documents\/.+-document-\d+$/);
      expect(pdfProps().source.uri).toMatch(
        new RegExp(`^${DOCUMENTS_DIRECTORY}[0-9a-f]{64}\\.pdf$`),
      );
      expect(screen.getByTestId(DOCUMENTS_TEST_IDS.documentProtectedBadge)).toHaveTextContent(
        t('document.protectedBadge'),
      );
      const [tile] = screen.getAllByTestId(DOCUMENTS_TEST_IDS.documentWatermarkTile, {
        includeHiddenElements: true,
      });
      expect(tile).toHaveTextContent('Alice Martin', { exact: false });
      expect(tile).toHaveTextContent(ALICE, { exact: false });
      expect(screen.getByTestId(DOCUMENTS_TEST_IDS.documentTitle)).toBeTruthy();
    },
  );

  it('opens the saved copy when the simulated network is cut, and says since when', async () => {
    setDeviceLanguages('en');
    const { t } = createI18n('en');
    const { getPathname } = renderRouter();
    const row = await openAMeetingWithAConfidentialDocument(t);
    fireEvent.press(row);
    await screen.findByTestId(DOCUMENTS_TEST_IDS.documentPdf);
    const location = pdfProps().source.uri;
    act(() => {
      router.back();
    });
    await screen.findByTestId(MEETINGS_TEST_IDS.meetingDetail);
    fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));
    await screen.findByTestId(CORE_TEST_IDS.offlineBanner);

    fireEvent.press(screen.getByTestId(row.props.testID as string));

    await screen.findByTestId(DOCUMENTS_TEST_IDS.documentPdf);
    expect(getPathname()).toMatch(/^\/documents\//);
    expect(pdfProps().source.uri).toBe(location);
    expect(screen.getByTestId(CORE_TEST_IDS.staleBanner)).toBeTruthy();
    expect(screen.getByTestId(DOCUMENTS_TEST_IDS.documentProtectedBadge)).toBeTruthy();
  });
});
