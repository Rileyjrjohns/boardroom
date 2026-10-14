import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createFakes } from '@application/testing/createFakes';
import {
  aConfidentialDocument,
  aDocument,
  aDocumentId,
  aDocumentLocation,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { APP_STATE } from '../session/appState';
import { ACCESS } from '../state/uiStore';
import { TEST_IDS, documentTestId, meetingRowTestId } from '../testIds';
import { driveAppState } from '../testing/appState';
import { pdfStub, resetPdfStub } from '../testing/reactNativePdfStub';
import { renderApp } from '../testing/renderApp';
import type { RenderAppOptions } from '../testing/renderApp';
import { TEST_GRACE_PERIOD_MILLIS } from '../testing/renderScreen';

// Opening a document through the real navigator and the real route files, with the real session
// controller and the real use cases over the fakes of the ports: from the row of the meeting to
// the viewer and back, and what is left of the document, on the screen, in the protection of the
// screen and in memory, once the user has left it by any way (back, lock, sign-out, session end).

const REPORT = aConfidentialDocument({
  id: aDocumentId('report'),
  title: 'Remuneration report',
  pageCount: 12,
});
const PACK = aDocument({ id: aDocumentId('pack'), title: 'Board pack', pageCount: 3 });
const MEETING = aMeeting({
  summary: aMeetingSummary({ id: aMeetingId('meeting-1'), title: 'Board of directors' }),
  documents: [REPORT, PACK],
});
const PASSWORD = 'secret';

beforeEach(() => {
  resetPdfStub();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function startApp(options: RenderAppOptions = {}) {
  const fakes = options.fakes ?? createFakes();
  fakes.auth.session = undefined;
  fakes.appLock.lock();
  fakes.meetings.addMeeting(MEETING);
  fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [MEETING]);
  for (const document of [REPORT, PACK]) {
    fakes.documents.addDocument(
      document,
      aDocumentLocation(`file:///documents/${document.id}.pdf`),
    );
  }
  const appState = driveAppState();
  const app = renderApp({ ...options, fakes });
  return { ...app, appState };
}

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function press(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testId));
  });
  await settle();
}

async function signIn(): Promise<void> {
  fireEvent.changeText(await screen.findByTestId(TEST_IDS.signInEmail), 'alice@example.com');
  fireEvent.changeText(screen.getByTestId(TEST_IDS.signInPassword), PASSWORD);
  await press(TEST_IDS.signInSubmit);
}

/** Signs in, opens the meeting, and presses the row of a document. */
async function openDocument(documentId: string, options: RenderAppOptions = {}) {
  const app = startApp(options);
  await signIn();
  await press(meetingRowTestId(MEETING.id));
  await press(documentTestId(documentId));
  await screen.findByTestId(TEST_IDS.documentScreen);
  return app;
}

/** What the header of the screens of the stack show as their title, first screen to last. */
function headerTitles(): string[] {
  const titles: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const rendered = node as {
      type?: string;
      props?: Record<string, unknown>;
      children?: unknown[] | null;
    };
    if (
      rendered.type === 'RNSScreenStackHeaderConfig' &&
      typeof rendered.props?.title === 'string'
    ) {
      titles.push(rendered.props.title);
    }
    rendered.children?.forEach(visit);
  };
  const tree = screen.toJSON();
  [tree ?? []].flat().forEach(visit);
  return titles;
}

/** Waits until the document is open and handed to the PDF view. */
async function viewed(): Promise<void> {
  await screen.findByTestId(TEST_IDS.documentPdf);
  await settle();
}

describe('opening a document from a meeting', () => {
  it('shows it in the viewer, protected and watermarked, at the address of the document', async () => {
    const { getPathname, fakes } = await openDocument('report');
    await viewed();

    expect(getPathname()).toBe('/documents/report');
    expect(fakes.screenProtection.enabled).toBe(true);
    expect(screen.getByRole('header', { name: 'Remuneration report' })).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.documentProtectedBadge)).toBeTruthy();
    expect(
      screen.getAllByTestId(TEST_IDS.documentWatermarkTile, { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
    expect(pdfStub.mounted).toBe(1);
  });

  it('shows a document that is not confidential with no protection', async () => {
    const { fakes } = await openDocument('pack');
    await viewed();

    expect(fakes.screenProtection.enabled).toBe(false);
    expect(screen.queryByTestId(TEST_IDS.documentProtectedBadge)).toBeNull();
    // Every document viewed carries the name of the reader, protected or not.
    expect(
      screen.getAllByTestId(TEST_IDS.documentWatermarkTile, { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  it('goes back to the meeting, and releases the screen, when the user goes back', async () => {
    const { fakes } = await openDocument('report');
    await viewed();

    act(() => {
      router.back();
    });
    await settle();

    expect(await screen.findByTestId(TEST_IDS.meetingDetail)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentScreen)).toBeNull();
    expect(fakes.screenProtection.enabled).toBe(false);
    expect(fakes.screenProtection.disableCalls).toBe(1);
    expect(fakes.screenProtection.listenerCount).toBe(0);
  });

  it('opens a second time the same way after coming back, a view at a time', async () => {
    const { fakes } = await openDocument('report');
    await viewed();
    act(() => {
      router.back();
    });
    await settle();
    await screen.findByTestId(TEST_IDS.meetingDetail);

    await press(documentTestId('report'));
    await viewed();

    expect(fakes.screenProtection.enabled).toBe(true);
    expect(fakes.screenProtection.enableCalls).toBe(2);
    expect(fakes.screenProtection.disableCalls).toBe(1);
  });

  it('puts one screen on the stack for two presses on the same row', async () => {
    const app = startApp();
    await signIn();
    await press(meetingRowTestId(MEETING.id));
    await screen.findByTestId(documentTestId('report'));

    await act(async () => {
      fireEvent.press(screen.getByTestId(documentTestId('report')));
      fireEvent.press(screen.getByTestId(documentTestId('report')));
    });
    await settle();
    await viewed();

    expect(app.fakes.documents.fetchContentCalls).toHaveLength(1);
    expect(app.fakes.screenProtection.enableCalls).toBe(1);
    act(() => {
      router.back();
    });
    await settle();
    expect(screen.queryByTestId(TEST_IDS.documentScreen)).toBeNull();
    expect(app.fakes.screenProtection.enabled).toBe(false);
  });

  it.each(SUPPORTED_LANGUAGES)(
    'titles the screen in the language of the user, in %s',
    async (language) => {
      const { t } = createI18n(language);
      await openDocument('report', { language });
      await viewed();

      expect(headerTitles()).toEqual([
        t('navigation.meetings'),
        t('navigation.meeting'),
        t('navigation.document'),
      ]);
    },
  );
});

describe('the app leaving the active state while a document is shown', () => {
  async function inactive(app: Awaited<ReturnType<typeof openDocument>>): Promise<void> {
    act(() => app.appState.emit(APP_STATE.Inactive));
    await settle();
  }

  async function awayAndBack(app: Awaited<ReturnType<typeof openDocument>>, away: number) {
    act(() => app.appState.emit(APP_STATE.Inactive));
    act(() => app.appState.emit(APP_STATE.Background));
    app.fakes.clock.advance(away);
    await act(async () => {
      app.appState.emit(APP_STATE.Active);
    });
    await settle();
  }

  it('unmounts the PDF view as soon as the app is inactive, and keeps the document protected', async () => {
    const app = await openDocument('report');
    await viewed();
    expect(pdfStub.mounted).toBe(1);

    await inactive(app);

    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(pdfStub.latest).toBeUndefined();
    expect(app.fakes.screenProtection.enabled).toBe(true);
    expect(app.fakes.screenProtection.disableCalls).toBe(0);
  });

  it('mounts the PDF view again when the app is active again before the grace period is over', async () => {
    const app = await openDocument('report');
    await viewed();

    await awayAndBack(app, TEST_GRACE_PERIOD_MILLIS - 1);

    expect(await screen.findByTestId(TEST_IDS.documentPdf)).toBeTruthy();
    expect(pdfStub.mounted).toBe(2);
    expect(pdfStub.latest).toBeDefined();
    expect(app.fakes.screenProtection.enabled).toBe(true);
    expect(app.fakes.documents.fetchContentCalls).toHaveLength(1);
  });

  it('mounts it again after a return from inactive that never went to the background', async () => {
    const app = await openDocument('report');
    await viewed();
    await inactive(app);

    await act(async () => {
      app.appState.emit(APP_STATE.Active);
    });
    await settle();

    expect(await screen.findByTestId(TEST_IDS.documentPdf)).toBeTruthy();
    expect(pdfStub.mounted).toBe(2);
  });

  it('mounts nothing again when the return finds the app locked: the screen is gone, the view stays unmounted', async () => {
    const app = await openDocument('report');
    await viewed();

    await awayAndBack(app, TEST_GRACE_PERIOD_MILLIS);

    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentScreen)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(pdfStub.latest).toBeUndefined();
    // The view was mounted once, before the app left: it was never mounted for the lock to catch.
    expect(pdfStub.mounted).toBe(1);
    expect(app.fakes.screenProtection.enabled).toBe(false);
    expect(app.fakes.screenProtection.disableCalls).toBe(1);
  });

  it('keeps the view unmounted until the lock has been judged on the way back', async () => {
    const app = await openDocument('report');
    await viewed();
    let release: () => void = () => undefined;
    const judging = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evaluate = app.services.useCases.evaluateAppLock.execute.bind(
      app.services.useCases.evaluateAppLock,
    );
    jest
      .spyOn(app.services.useCases.evaluateAppLock, 'execute')
      .mockImplementation(async (input) => {
        await judging;
        return evaluate(input);
      });

    act(() => app.appState.emit(APP_STATE.Inactive));
    act(() => app.appState.emit(APP_STATE.Background));
    await act(async () => {
      app.appState.emit(APP_STATE.Active);
    });
    await settle();

    // Active again, but the lock is not judged: the cover is up and the view is out.
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(pdfStub.mounted).toBe(1);

    release();
    await settle();

    expect(await screen.findByTestId(TEST_IDS.documentPdf)).toBeTruthy();
    expect(pdfStub.mounted).toBe(2);
  });
});

describe('leaving the document without going back', () => {
  it('releases the screen, and shows and keeps nothing of the document, when the app locks', async () => {
    const app = await openDocument('report');
    await viewed();
    // The meeting under the document is in the cache (with the list of its documents); the opened
    // document is not: not under a key of its own, not its location, not the watermark of the reader.
    const queries = app.queryClient.getQueryCache().getAll();
    expect(queries.map(({ queryKey }) => queryKey[0])).not.toContain('documents');
    expect(JSON.stringify(queries.map(({ state }) => state.data))).not.toMatch(
      /documents\/report\.pdf|viewedAt/,
    );
    expect(app.fakes.screenProtection.enabled).toBe(true);

    act(() => app.appState.emit(APP_STATE.Inactive));
    act(() => app.appState.emit(APP_STATE.Background));
    app.fakes.clock.advance(TEST_GRACE_PERIOD_MILLIS);
    await act(async () => {
      app.appState.emit(APP_STATE.Active);
    });
    await settle();

    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentScreen)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.documentPdf)).toBeNull();
    expect(screen.queryByText('Remuneration report')).toBeNull();
    expect(
      screen.queryAllByTestId(TEST_IDS.documentWatermarkTile, { includeHiddenElements: true }),
    ).toEqual([]);
    expect(app.fakes.screenProtection.enabled).toBe(false);
    expect(app.fakes.screenProtection.disableCalls).toBe(1);
    expect(app.fakes.screenProtection.listenerCount).toBe(0);
    expect(app.queryClient.getQueryCache().getAll()).toEqual([]);
    expect(app.queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it('does the same when the user signs out', async () => {
    const app = await openDocument('report');
    await viewed();

    act(() => {
      app.uiStore.getState().signedOut();
    });
    await settle();

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.documentScreen)).toBeNull();
    expect(screen.queryByText('Remuneration report')).toBeNull();
    expect(app.fakes.screenProtection.enabled).toBe(false);
    expect(app.fakes.screenProtection.disableCalls).toBe(1);
    expect(app.queryClient.getQueryCache().getAll()).toEqual([]);
    expect(router.canGoBack()).toBe(false);
  });

  it('does the same when the session ends while the document is open', async () => {
    const app = await openDocument('report');
    await viewed();

    app.fakes.clock.advance(2 * 3_600_000);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(app.uiStore.getState().access).toBe(ACCESS.SignedOut);
    expect(screen.queryByTestId(TEST_IDS.documentScreen)).toBeNull();
    expect(app.fakes.screenProtection.enabled).toBe(false);
    expect(app.fakes.screenProtection.disableCalls).toBe(1);
    expect(app.queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('does not reach a document by a link while nobody is signed in', async () => {
    const { getPathname, fakes } = startApp({ initialUrl: '/documents/report' });

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(getPathname()).toBe('/sign-in');
    expect(fakes.documents.fetchContentCalls).toEqual([]);
    expect(fakes.screenProtection.enableCalls).toBe(0);
  });
});
