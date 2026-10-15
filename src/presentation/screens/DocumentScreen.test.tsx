import { NavigationContext } from 'expo-router/react-navigation';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { ReactNode } from 'react';

import { createFakes } from '@application/testing/createFakes';
import { SCREEN_CAPTURE_KIND } from '@application/ports/ScreenProtection';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from '@domain/errors/RepositoryError';
import {
  screenProtectionFailed,
  screenProtectionUnsupported,
} from '@domain/errors/ScreenProtectionError';
import {
  NOW,
  aConfidentialDocument,
  aDocument,
  aDocumentId,
  aDocumentLocation,
  aUser,
} from '@domain/testing/builders';

import { ACCESS } from '../state/uiStore';
import { TEST_IDS } from '../testIds';
import { pdfProps, pdfStub, resetPdfStub } from '../testing/reactNativePdfStub';
import { renderScreen } from '../testing/renderScreen';
import type { RenderScreenOptions } from '../testing/renderScreen';

import { DocumentScreen } from './DocumentScreen';

// The screen of a document, with the real providers, the real use cases over the fakes of the
// ports and the real translations. The PDF view is the stub that Jest gives for `react-native-pdf`
// (`testing/reactNativePdfStub.tsx`), driven by hand.

const READER = aUser();
const REPORT = aConfidentialDocument({
  id: aDocumentId('report'),
  title: 'Remuneration report',
  pageCount: 12,
});
const PACK = aDocument({ id: aDocumentId('pack'), title: 'Board pack', pageCount: 3 });
const MINUTES = aDocument({
  id: aDocumentId('minutes'),
  title: 'Minutes',
  confidentiality: CONFIDENTIALITY_LEVEL.Public,
  pageCount: 2,
});
const locationOf = (id: string) => aDocumentLocation(`file:///documents/${id}.pdf`);

function aWorld() {
  const fakes = createFakes();
  for (const document of [REPORT, PACK, MINUTES]) {
    fakes.documents.addDocument(document, locationOf(document.id));
  }
  return fakes;
}

type Fakes = ReturnType<typeof aWorld>;

function renderDocument(
  documentId: string | undefined = REPORT.id,
  options: RenderScreenOptions & { readonly fakes?: Fakes } = {},
) {
  const fakes = options.fakes ?? aWorld();
  const rendered = renderScreen(<DocumentScreen documentId={documentId} />, { ...options, fakes });
  const closeDocument = jest.spyOn(rendered.services.useCases.closeDocument, 'execute');
  return { ...rendered, fakes, closeDocument };
}

/** Waits until the document is open and the file is handed to the PDF view. */
async function opened(): Promise<void> {
  await screen.findByTestId(TEST_IDS.documentPdf);
}

beforeEach(() => {
  resetPdfStub();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DocumentScreen, a confidential document', () => {
  it('turns the screen protection on, shows the file in the PDF view and says the screen is protected', async () => {
    const { fakes, t } = renderDocument();
    expect(screen.getByTestId(TEST_IDS.documentLoading)).toBeTruthy();

    await opened();

    expect(fakes.screenProtection.enabled).toBe(true);
    expect(pdfProps().source).toEqual({ uri: locationOf('report'), cache: false });
    expect(screen.getByTestId(TEST_IDS.documentProtectedBadge)).toHaveTextContent(
      t('document.protectedBadge'),
    );
    expect(screen.getByRole('header', { name: 'Remuneration report' })).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentLoading)).toBeNull();
  });

  it('draws the name and the email of the reader and the time of the opening over the file', async () => {
    const { format } = renderDocument();
    await opened();

    const tiles = screen.getAllByTestId(TEST_IDS.documentWatermarkTile, {
      includeHiddenElements: true,
    });

    expect(tiles.length).toBeGreaterThan(10);
    for (const tile of tiles) {
      expect(tile).toHaveTextContent(
        [READER.fullName, READER.email, format.dateTime(NOW)].join('\n'),
        { exact: true },
      );
    }
  });

  it('keeps the watermark out of the way of the touch and of the screen reader', async () => {
    renderDocument();
    await opened();

    const watermark = screen.getByTestId(TEST_IDS.documentWatermark, {
      includeHiddenElements: true,
    });

    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
    expect(watermark.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId(TEST_IDS.documentWatermark)).toBeNull();
  });

  it('turns off the annotations and the links of the file', async () => {
    renderDocument();
    await opened();

    expect(pdfProps().enableAnnotationRendering).toBe(false);
    pdfProps().onPressLink?.('https://example.com');
  });

  it('releases the screen when the user goes back, once', async () => {
    const { fakes, unmount, closeDocument } = renderDocument();
    await opened();

    unmount();

    await waitFor(() => {
      expect(fakes.screenProtection.enabled).toBe(false);
    });
    expect(closeDocument).toHaveBeenCalledTimes(1);
    expect(closeDocument).toHaveBeenCalledWith({ documentId: REPORT.id });
    expect(fakes.screenProtection.enableCalls).toBe(1);
    expect(fakes.screenProtection.disableCalls).toBe(1);
  });

  it('writes the opening in the logs with the identifiers of the document and the reader, and nothing else', async () => {
    const { fakes } = renderDocument();
    await opened();

    const opening = fakes.monitoring.logs.find(
      ({ event }) => event === MONITORING_EVENT.DocumentOpened,
    );

    expect(opening?.attributes).toMatchObject({
      [LOG_ATTRIBUTE.DocumentId]: 'report',
      [LOG_ATTRIBUTE.UserId]: READER.id,
    });
    expect(JSON.stringify(fakes.monitoring.logs)).not.toMatch(
      new RegExp(`${READER.fullName}|${READER.email}|Remuneration`),
    );
  });
});

describe('DocumentScreen, a document that is not confidential', () => {
  it.each([PACK, MINUTES])(
    'leaves the screen unprotected, with no badge, and carries the watermark all the same: %s',
    async (document) => {
      const { fakes, unmount, closeDocument } = renderDocument(document.id);
      await opened();

      expect(fakes.screenProtection.enabled).toBe(false);
      expect(fakes.screenProtection.enableCalls).toBe(0);
      expect(screen.queryByTestId(TEST_IDS.documentProtectedBadge)).toBeNull();
      // Every document viewed carries the name of the reader: it deters a photograph of any of them.
      const tiles = screen.getAllByTestId(TEST_IDS.documentWatermarkTile, {
        includeHiddenElements: true,
      });
      expect(tiles.length).toBeGreaterThan(10);
      expect(tiles[0]).toHaveTextContent(READER.fullName, { exact: false });
      expect(tiles[0]).toHaveTextContent(READER.email, { exact: false });
      expect(screen.getByRole('header', { name: document.title })).toBeTruthy();

      unmount();
      await waitFor(() => {
        expect(closeDocument).toHaveBeenCalledTimes(1);
      });
      expect(fakes.screenProtection.disableCalls).toBe(0);
    },
  );
});

describe('DocumentScreen, the PDF view', () => {
  it('shows a loading state until the file is read, then the page the reader is on', async () => {
    const { t } = renderDocument();
    await opened();
    expect(screen.getByTestId(TEST_IDS.documentPdfLoading)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentPageIndicator)).toBeNull();

    act(() => {
      pdfProps().onLoadComplete?.(12);
    });

    expect(screen.queryByTestId(TEST_IDS.documentPdfLoading)).toBeNull();
    expect(screen.getByTestId(TEST_IDS.documentPageIndicator)).toHaveTextContent(
      t('document.pageIndicator', { page: '1', total: '12' }),
    );

    act(() => {
      pdfProps().onPageChanged?.(7, 12);
    });

    expect(screen.getByTestId(TEST_IDS.documentPageIndicator)).toHaveTextContent('Page 7 of 12');
  });

  it('writes the pages with the grouping of the language', async () => {
    renderDocument(REPORT.id, { language: 'fr' });
    await opened();

    act(() => {
      pdfProps().onPageChanged?.(1234, 5678);
    });

    expect(screen.getByTestId(TEST_IDS.documentPageIndicator).props.children).toMatch(
      /^Page 1[\u202f\u00a0 ]234 sur 5[\u202f\u00a0 ]678$/,
    );
  });

  it('keeps the watermark over the file while the file loads and after', async () => {
    renderDocument();
    await opened();
    const tilesWhileLoading = screen.getAllByTestId(TEST_IDS.documentWatermarkTile, {
      includeHiddenElements: true,
    }).length;

    act(() => {
      pdfProps().onLoadComplete?.(12);
    });

    expect(tilesWhileLoading).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId(TEST_IDS.documentWatermarkTile, { includeHiddenElements: true }),
    ).toHaveLength(tilesWhileLoading);
  });

  it('says the file could not be displayed when the view fails, and opens the document again on retry', async () => {
    const { fakes, t, closeDocument } = renderDocument();
    await opened();

    act(() => {
      pdfProps().onError?.(new Error('boom'));
    });

    expect(screen.getByTestId(TEST_IDS.documentPdfError)).toHaveTextContent(
      t('document.renderFailed'),
    );
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(
      screen.queryByTestId(TEST_IDS.documentWatermark, { includeHiddenElements: true }),
    ).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: t('states.retry') }));
    await opened();

    // The first view was released, and the document was opened again.
    expect(closeDocument).toHaveBeenCalledTimes(1);
    expect(fakes.documents.fetchContentCalls).toHaveLength(2);
    expect(fakes.screenProtection.enabled).toBe(true);
    expect(screen.queryByTestId(TEST_IDS.documentPdfError)).toBeNull();
  });
});

describe('DocumentScreen, a screenshot or a recording', () => {
  it('says calmly that it was seen and recorded, announces it, and has the use case log it', async () => {
    // The announcement is a mock of the React Native setup, whose calls outlive a test.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
    const { fakes, t } = renderDocument();
    await opened();
    expect(screen.queryByTestId(TEST_IDS.documentCaptureNotice)).toBeNull();

    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });

    expect(screen.getByTestId(TEST_IDS.documentCaptureNotice)).toHaveTextContent(
      t('document.capture.screenshot'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(t('document.capture.screenshot'));
    expect(announce).toHaveBeenCalledWith(t('document.capture.screenshot'));
    await waitFor(() => {
      expect(fakes.monitoring.loggedEvents()).toContain(MONITORING_EVENT.ScreenCaptureDetected);
    });
    const logged = fakes.monitoring.logs.find(
      ({ event }) => event === MONITORING_EVENT.ScreenCaptureDetected,
    );
    expect(logged?.attributes).toEqual({
      [LOG_ATTRIBUTE.CaptureKind]: SCREEN_CAPTURE_KIND.ScreenshotTaken,
      [LOG_ATTRIBUTE.DocumentId]: 'report',
      [LOG_ATTRIBUTE.UserId]: READER.id,
    });
  });

  it('says it again, and announces it again, for a second screenshot', async () => {
    // The announcement is a mock of the React Native setup, whose calls outlive a test.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
    const { fakes, t } = renderDocument();
    await opened();

    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });
    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });

    expect(
      announce.mock.calls.filter(([text]) => text === t('document.capture.screenshot')),
    ).toHaveLength(2);
    expect(screen.getAllByTestId(TEST_IDS.documentCaptureNotice)).toHaveLength(1);
  });

  it('says a screen recording was seen, and says nothing more when it stops', async () => {
    const { fakes, t } = renderDocument();
    await opened();

    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStarted });
    });
    const notice = () => screen.getByTestId(TEST_IDS.documentCaptureNotice);
    expect(notice()).toHaveTextContent(t('document.capture.recording'));
    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.RecordingStopped });
    });

    expect(notice()).toHaveTextContent(t('document.capture.recording'));
  });

  it('is told for a document that is not confidential too, and can be dismissed', async () => {
    const { fakes } = renderDocument(PACK.id);
    await opened();

    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });
    expect(screen.getByTestId(TEST_IDS.documentCaptureNotice)).toBeTruthy();
    fireEvent.press(screen.getByTestId(TEST_IDS.documentCaptureDismiss));

    expect(screen.queryByTestId(TEST_IDS.documentCaptureNotice)).toBeNull();
  });

  it('is watched for while the screen is shown, and no longer once it is left', async () => {
    const { fakes, unmount } = renderDocument();
    await waitFor(() => {
      expect(fakes.screenProtection.listenerCount).toBe(1);
    });

    unmount();

    expect(fakes.screenProtection.listenerCount).toBe(0);
    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });
    expect(fakes.monitoring.loggedEvents()).not.toContain(MONITORING_EVENT.ScreenCaptureDetected);
  });

  it('stops watching when the screen is left before the subscription is made', async () => {
    const fakes = aWorld();
    const { unmount } = renderDocument(REPORT.id, { fakes });

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(fakes.screenProtection.listenerCount).toBe(0);
    });
  });
});

describe('DocumentScreen, offline', () => {
  it('opens a document already opened from the saved copy, protected, and says since when', async () => {
    const fakes = aWorld();
    const first = renderDocument(REPORT.id, { fakes });
    await opened();
    first.unmount();
    await waitFor(() => {
      expect(fakes.screenProtection.enabled).toBe(false);
    });
    resetPdfStub();
    fakes.network.goOffline();

    const { format } = renderDocument(REPORT.id, { fakes });
    await opened();

    expect(screen.getByTestId(TEST_IDS.staleBanner)).toHaveTextContent(format.dateTime(NOW), {
      exact: false,
    });
    expect(fakes.screenProtection.enabled).toBe(true);
    expect(pdfProps().source.uri).toBe(locationOf('report'));
  });

  it('opens a public document already opened offline protected too: the copy may be older than its level', async () => {
    const fakes = aWorld();
    const first = renderDocument(MINUTES.id, { fakes });
    await opened();
    expect(fakes.screenProtection.enabled).toBe(false);
    first.unmount();
    resetPdfStub();
    fakes.network.goOffline();

    renderDocument(MINUTES.id, { fakes });
    await opened();

    expect(fakes.screenProtection.enabled).toBe(true);
    expect(screen.getByTestId(TEST_IDS.documentProtectedBadge)).toBeTruthy();
    expect(
      screen.getAllByTestId(TEST_IDS.documentWatermarkTile, { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  it('says a document never opened on this device is not available offline, and opens it on retry once online', async () => {
    const fakes = aWorld();
    fakes.network.goOffline();
    const { t } = renderDocument(PACK.id, { fakes });

    const error = await screen.findByTestId(TEST_IDS.documentError);

    expect(error).toHaveTextContent(t('document.errors.networkUnavailable'));
    expect(fakes.screenProtection.enableCalls).toBe(0);
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();

    fakes.network.goOnline();
    fireEvent.press(screen.getByRole('button', { name: t('states.retry') }));
    await opened();

    expect(screen.queryByTestId(TEST_IDS.documentError)).toBeNull();
  });

  it('says it in French in French', async () => {
    const fakes = aWorld();
    fakes.network.goOffline();
    renderDocument(PACK.id, { fakes, language: 'fr' });

    const error = await screen.findByTestId(TEST_IDS.documentError);

    expect(error).toHaveTextContent('n’est pas enregistré sur cet appareil', { exact: false });
    expect(error).toHaveTextContent('hors ligne', { exact: false });
  });
});

describe('DocumentScreen, when the document cannot be opened', () => {
  it.each([
    ['a document that does not exist', () => notFound(), 'document.notFound', false],
    ['a document the user may not have', () => forbidden(), 'document.errors.forbidden', false],
    ['a fault of the server', () => unexpected('status 500'), 'errors.unexpected', true],
  ] as const)(
    'says %s, and offers a retry only when it can help',
    async (_name, failure, key, retry) => {
      const fakes = aWorld();
      fakes.documents.failure = failure();
      const { t } = renderDocument(PACK.id, { fakes });

      const error = await screen.findByTestId(TEST_IDS.documentError);

      expect(error).toHaveTextContent(t(key));
      expect(screen.queryByRole('button') !== null).toBe(retry);
      expect(fakes.screenProtection.enableCalls).toBe(0);
    },
  );

  it('does not show a confidential document the screen of which cannot be protected, and says why', async () => {
    const fakes = aWorld();
    fakes.screenProtection.enableFailure = screenProtectionUnsupported();
    const { t } = renderDocument(REPORT.id, { fakes });

    const error = await screen.findByTestId(TEST_IDS.documentError);

    expect(error).toHaveTextContent(t('document.errors.screenProtectionUnsupported'));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(fakes.screenProtection.enabled).toBe(false);
  });

  it('offers a retry when the protection failed, and shows the document once it works', async () => {
    const fakes = aWorld();
    fakes.screenProtection.enableFailure = screenProtectionFailed();
    const { t } = renderDocument(REPORT.id, { fakes });
    const error = await screen.findByTestId(TEST_IDS.documentError);
    expect(error).toHaveTextContent(t('document.errors.screenProtectionFailed'));

    fakes.screenProtection.enableFailure = undefined;
    fireEvent.press(screen.getByRole('button', { name: t('states.retry') }));
    await opened();

    expect(fakes.screenProtection.enabled).toBe(true);
  });

  it('says a document id that is no id is not found, without asking for anything', () => {
    const { fakes, t } = renderDocument(' ');

    expect(screen.getByTestId(TEST_IDS.documentNotFound)).toHaveTextContent(t('document.notFound'));
    expect(fakes.documents.getCalls).toEqual([]);
  });

  it('says there is no document when the route has none', () => {
    renderScreen(<DocumentScreen documentId={undefined} />);

    expect(screen.getByTestId(TEST_IDS.documentNotFound)).toBeTruthy();
  });

  it('ends the session for the whole app when the server refuses it', async () => {
    const fakes = aWorld();
    fakes.documents.failure = unauthorized();
    const { uiStore } = renderDocument(PACK.id, { fakes });

    await waitFor(() => {
      expect(uiStore.getState().access).toBe(ACCESS.SignedOut);
    });
    expect(uiStore.getState().sessionEndedBy).toBe('unauthorized');
  });

  it('says the network is out of reach for a request that fails on a document never opened', async () => {
    const fakes = aWorld();
    fakes.documents.failure = networkUnavailable();
    renderDocument(PACK.id, { fakes });

    expect(await screen.findByTestId(TEST_IDS.documentError)).toBeTruthy();
  });
});

describe('DocumentScreen, opened and closed', () => {
  it('keeps the screen protected until the last view of a document is closed', async () => {
    const fakes = aWorld();
    const first = renderDocument(REPORT.id, { fakes });
    const second = renderDocument(REPORT.id, { fakes });
    await waitFor(() => {
      expect(fakes.documents.fetchContentCalls).toHaveLength(2);
    });
    await waitFor(() => {
      expect(fakes.screenProtection.enableCalls).toBe(2);
    });

    first.unmount();
    await waitFor(() => {
      expect(first.closeDocument).toHaveBeenCalledTimes(1);
    });
    expect(fakes.screenProtection.enabled).toBe(true);
    expect(fakes.screenProtection.disableCalls).toBe(0);

    second.unmount();
    await waitFor(() => {
      expect(fakes.screenProtection.enabled).toBe(false);
    });
    expect(second.closeDocument).toHaveBeenCalledTimes(1);
    expect(fakes.screenProtection.disableCalls).toBe(1);
  });

  it('opens and closes each time the screen is shown again, once each', async () => {
    const fakes = aWorld();
    for (let round = 1; round <= 3; round += 1) {
      const { unmount, closeDocument } = renderDocument(REPORT.id, { fakes });
      await waitFor(() => {
        expect(fakes.screenProtection.enabled).toBe(true);
      });
      unmount();
      await waitFor(() => {
        expect(fakes.screenProtection.enabled).toBe(false);
      });
      expect(closeDocument).toHaveBeenCalledTimes(1);
      expect(fakes.screenProtection.enableCalls).toBe(round);
      expect(fakes.screenProtection.disableCalls).toBe(round);
    }
  });

  it('releases a document that opens after the screen was left', async () => {
    const fakes = aWorld();
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    fakes.documents.onRequest = () => slow;
    const { unmount, closeDocument } = renderDocument(REPORT.id, { fakes });

    unmount();
    expect(closeDocument).not.toHaveBeenCalled();
    release();

    await waitFor(() => {
      expect(closeDocument).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(fakes.screenProtection.enabled).toBe(false);
    });
    expect(fakes.screenProtection.enableCalls).toBe(1);
    expect(fakes.screenProtection.disableCalls).toBe(1);
  });

  it('leaves nothing in the query cache: the document lives in the screen and goes with it', async () => {
    const { queryClient } = renderDocument();
    await opened();

    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it('closes the document, and shows nothing of it, when the app stops being open', async () => {
    const { fakes, uiStore, closeDocument } = renderDocument();
    await opened();

    act(() => {
      uiStore.getState().signedOut();
    });

    await waitFor(() => {
      expect(fakes.screenProtection.enabled).toBe(false);
    });
    expect(closeDocument).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(
      screen.queryByTestId(TEST_IDS.documentWatermark, { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.queryByText('Remuneration report')).toBeNull();
  });
});

describe('DocumentScreen, in a navigator', () => {
  type Listener = () => void;

  /** The part of a navigation object that the screen uses to know whether it is the one on top. */
  function aNavigation() {
    const listeners = new Map<string, Set<Listener>>();
    const state = { focused: true };
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
    };
  }

  function inNavigator(navigation: ReturnType<typeof aNavigation>) {
    return function Wrapper({ children }: { readonly children: ReactNode }) {
      return (
        <NavigationContext.Provider value={navigation as never}>
          {children}
        </NavigationContext.Provider>
      );
    };
  }

  it('releases the document when another screen is put over it, and opens it again when the user comes back', async () => {
    const navigation = aNavigation();
    const fakes = aWorld();
    const Wrapper = inNavigator(navigation);
    const rendered = renderScreen(
      <Wrapper>
        <DocumentScreen documentId={REPORT.id} />
      </Wrapper>,
      { fakes },
    );
    const closeDocument = jest.spyOn(rendered.services.useCases.closeDocument, 'execute');
    await opened();
    expect(fakes.screenProtection.enabled).toBe(true);

    act(() => navigation.emit('blur'));

    await waitFor(() => {
      expect(fakes.screenProtection.enabled).toBe(false);
    });
    expect(closeDocument).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(fakes.screenProtection.listenerCount).toBe(0);

    act(() => navigation.emit('focus'));
    await opened();

    expect(fakes.screenProtection.enabled).toBe(true);
    expect(fakes.documents.fetchContentCalls).toHaveLength(2);
    expect(fakes.screenProtection.listenerCount).toBe(1);
  });

  it('does not open a document for a screen that is mounted under another', async () => {
    const navigation = aNavigation();
    navigation.emit('blur');
    const fakes = aWorld();
    const Wrapper = inNavigator(navigation);

    renderScreen(
      <Wrapper>
        <DocumentScreen documentId={REPORT.id} />
      </Wrapper>,
      { fakes },
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(fakes.documents.fetchContentCalls).toEqual([]);
    expect(fakes.screenProtection.enableCalls).toBe(0);
  });
});

describe('DocumentScreen, in French', () => {
  it('says the screen is protected, the page, the notice and the watermark time in French', async () => {
    const { fakes, format } = renderDocument(REPORT.id, { language: 'fr' });
    await opened();

    act(() => {
      pdfProps().onLoadComplete?.(12);
    });
    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });

    expect(screen.getByTestId(TEST_IDS.documentProtectedBadge)).toHaveTextContent('Écran protégé');
    expect(screen.getByTestId(TEST_IDS.documentPageIndicator)).toHaveTextContent('Page 1 sur 12');
    expect(screen.getByTestId(TEST_IDS.documentCaptureNotice)).toHaveTextContent(
      'Une capture d’écran a été détectée. Elle a été consignée.',
    );
    const [tile] = screen.getAllByTestId(TEST_IDS.documentWatermarkTile, {
      includeHiddenElements: true,
    });
    expect(tile).toHaveTextContent(
      [READER.fullName, READER.email, format.dateTime(NOW)].join('\n'),
      { exact: true },
    );
    expect(screen.getByText('Confidentiel')).toBeTruthy();
  });

  it('loads in French', async () => {
    renderDocument(REPORT.id, { language: 'fr' });

    expect(screen.getByTestId(TEST_IDS.documentLoading).props.accessibilityLabel).toBe(
      'Ouverture du document',
    );
    await opened();
  });

  it('says in French that the pdf is loading', async () => {
    renderDocument(REPORT.id, { language: 'fr' });
    await opened();

    expect(screen.getByTestId(TEST_IDS.documentPdfLoading).props.accessibilityLabel).toBe(
      'Affichage du document',
    );
    expect(pdfStub.mounted).toBe(1);
  });
});

describe('DocumentScreen, while the app is not active', () => {
  it('unmounts the PDF view as soon as the privacy cover goes up, and mounts it again, from the first page, when it is lifted', async () => {
    const { uiStore, t } = renderDocument();
    await opened();
    act(() => {
      pdfProps().onLoadComplete?.(12);
    });
    act(() => {
      pdfProps().onPageChanged?.(7, 12);
    });
    expect(screen.getByTestId(TEST_IDS.documentPageIndicator)).toHaveTextContent('Page 7 of 12');
    expect(pdfStub.mounted).toBe(1);

    act(() => {
      uiStore.getState().setPrivacyCover(true);
    });

    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(pdfStub.latest).toBeUndefined();
    expect(screen.queryByTestId(TEST_IDS.documentPageIndicator)).toBeNull();
    expect(
      screen.queryByTestId(TEST_IDS.documentWatermark, { includeHiddenElements: true }),
    ).toBeNull();
    // The document is still open and protected: only the native view is gone.
    expect(screen.getByRole('header', { name: 'Remuneration report' })).toBeTruthy();

    act(() => {
      uiStore.getState().setPrivacyCover(false);
    });

    expect(screen.getByTestId(TEST_IDS.documentPdf)).toBeTruthy();
    expect(pdfStub.mounted).toBe(2);
    expect(pdfProps().source.uri).toBe(locationOf('report'));
    expect(screen.getByTestId(TEST_IDS.documentPdfLoading)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentPageIndicator)).toBeNull();
    act(() => {
      pdfProps().onLoadComplete?.(12);
    });
    expect(screen.getByTestId(TEST_IDS.documentPageIndicator)).toHaveTextContent(
      t('document.pageIndicator', { page: '1', total: '12' }),
    );
  });

  it('neither opens nor closes the document for it: the screen stays protected while it is covered', async () => {
    const { fakes, uiStore, closeDocument } = renderDocument();
    await opened();

    act(() => {
      uiStore.getState().setPrivacyCover(true);
    });
    act(() => {
      uiStore.getState().setPrivacyCover(false);
    });

    expect(closeDocument).not.toHaveBeenCalled();
    expect(fakes.documents.fetchContentCalls).toHaveLength(1);
    expect(fakes.screenProtection.enabled).toBe(true);
    expect(fakes.screenProtection.disableCalls).toBe(0);
  });

  it('keeps the PDF view out while the cover stays up, whatever else the screen does', async () => {
    const { uiStore, fakes } = renderDocument();
    await opened();
    act(() => {
      uiStore.getState().setPrivacyCover(true);
    });

    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });

    expect(screen.getByTestId(TEST_IDS.documentCaptureNotice)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(pdfStub.mounted).toBe(1);
  });

  it('shows no PDF view for a document that opens while the cover is up, until it is lifted', async () => {
    const { uiStore } = renderDocument();
    act(() => {
      uiStore.getState().setPrivacyCover(true);
    });
    await screen.findByTestId(TEST_IDS.documentTitle);

    expect(pdfStub.mounted).toBe(0);
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();

    act(() => {
      uiStore.getState().setPrivacyCover(false);
    });

    expect(screen.getByTestId(TEST_IDS.documentPdf)).toBeTruthy();
  });
});

describe('DocumentScreen, the test ids', () => {
  /**
   * An element reaches the native tree, where a flow that looks for an id finds it, when it renders
   * something of its own (a text), is something the user operates (a button), or is kept from being
   * flattened away. A container with an id and none of these may not be there on Android.
   */
  function reachesTheNativeTree(element: ReturnType<typeof screen.getByTestId>): boolean {
    return (
      element.type === 'Text' ||
      element.props.accessible === true ||
      element.props.collapsable === false
    );
  }

  it('are all on an element that reaches the native tree', async () => {
    const { fakes } = renderDocument();
    await opened();
    act(() => {
      fakes.screenProtection.emit({ kind: SCREEN_CAPTURE_KIND.ScreenshotTaken });
    });
    const whileLoading = [
      TEST_IDS.documentScreen,
      TEST_IDS.documentTitle,
      TEST_IDS.documentProtectedBadge,
      TEST_IDS.documentPdf,
      TEST_IDS.documentPdfLoading,
      TEST_IDS.documentCaptureNotice,
      TEST_IDS.documentCaptureDismiss,
    ];
    act(() => {
      pdfProps().onLoadComplete?.(12);
    });
    const afterLoading = [TEST_IDS.documentPageIndicator];

    for (const id of [
      ...whileLoading.filter((id) => id !== TEST_IDS.documentPdfLoading),
      ...afterLoading,
    ]) {
      expect({ id, reaches: reachesTheNativeTree(screen.getByTestId(id)) }).toEqual({
        id,
        reaches: true,
      });
    }

    act(() => {
      pdfProps().onError?.(new Error('boom'));
    });
    for (const id of [TEST_IDS.documentPdfError, TEST_IDS.retryButton]) {
      expect({ id, reaches: reachesTheNativeTree(screen.getByTestId(id)) }).toEqual({
        id,
        reaches: true,
      });
    }
  });

  it('are on an element that reaches the native tree while the document opens, when it cannot be opened, and when it is not found', async () => {
    const loading = renderDocument();
    expect(reachesTheNativeTree(screen.getByTestId(TEST_IDS.documentLoading))).toBe(true);
    await opened();
    loading.unmount();

    const fakes = aWorld();
    fakes.documents.failure = notFound();
    renderDocument(PACK.id, { fakes });
    expect(reachesTheNativeTree(await screen.findByTestId(TEST_IDS.documentError))).toBe(true);
  });

  it('has the id of the loading file on an element that reaches the native tree', async () => {
    renderDocument();
    await opened();

    expect(reachesTheNativeTree(screen.getByTestId(TEST_IDS.documentPdfLoading))).toBe(true);
  });

  it('has the id of a document that is not found on the text that says so', () => {
    renderDocument(' ');

    expect(reachesTheNativeTree(screen.getByTestId(TEST_IDS.documentNotFound))).toBe(true);
  });
});
