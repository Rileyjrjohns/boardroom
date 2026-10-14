import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { createAgendaItem } from '@domain/entities/AgendaItem';
import { createMeeting } from '@domain/entities/Meeting';
import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import { unexpected } from '@domain/errors/RepositoryError';
import {
  MILLIS_PER_DAY,
  MILLIS_PER_HOUR,
  NOW,
  aConfidentialDocument,
  aDocument,
  aDocumentId,
  aMeeting,
  aMeetingId,
  aParticipant,
  aResolution,
  aResolutionId,
  aSession,
  anAgendaItem,
  anAgendaItemId,
  aUserId,
  at,
  unwrap,
} from '@domain/testing/builders';
import { PARTICIPANT_ROLE } from '@domain/entities/Participant';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import { createFormatters } from '../format/formatters';
import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { setDeviceLanguages } from '../i18n/testing/setDeviceLanguages';
import {
  TEST_IDS,
  agendaItemTestId,
  documentTestId,
  participantTestId,
  resolutionTestId,
} from '../testIds';
import { createFakes } from '@application/testing/createFakes';
import { ACCESS } from '../state/uiStore';
import { renderScreen } from '../testing/renderScreen';
import type { RenderScreenOptions } from '../testing/renderScreen';

import { MeetingDetailScreen } from './MeetingDetailScreen';

const CLOSES_AT = at(MILLIS_PER_DAY);

const MEETING = aMeeting({
  agenda: [
    unwrap(
      createAgendaItem({
        id: anAgendaItemId('opening'),
        position: 1,
        title: 'Opening',
        description: 'Welcome and apologies.',
      }),
    ),
    anAgendaItem({
      id: anAgendaItemId('budget'),
      position: 2,
      title: 'Budget',
      resolution: aResolution({
        id: aResolutionId('budget-vote'),
        title: 'Approve the budget',
        status: RESOLUTION_STATUS.Open,
        closesAt: CLOSES_AT,
        recordedVote: VOTE_CHOICE.Against,
      }),
    }),
    anAgendaItem({
      id: anAgendaItemId('elections'),
      position: 3,
      title: 'Elections',
      resolution: aResolution({
        id: aResolutionId('elections-vote'),
        title: 'Elect the chair',
        status: RESOLUTION_STATUS.Closed,
      }),
    }),
  ],
  documents: [
    aConfidentialDocument({
      id: aDocumentId('report'),
      title: 'Remuneration report',
      pageCount: 12,
    }),
    aDocument({ id: aDocumentId('pack'), title: 'Board pack', pageCount: 1 }),
  ],
  participants: [
    aParticipant({ fullName: 'Alice Martin', role: PARTICIPANT_ROLE.Member }),
    aParticipant({
      userId: aUserId('user-2'),
      fullName: 'Bruno Durand',
      role: PARTICIPANT_ROLE.Chair,
    }),
    aParticipant({
      userId: aUserId('user-4'),
      fullName: 'David Roux',
      role: PARTICIPANT_ROLE.Guest,
    }),
  ],
});

/** The screen for what the router gives as `meetingId`, with the standard meeting on the server. */
function renderDetailAt(meetingId: string | undefined, options: RenderScreenOptions = {}) {
  const onOpenDocument = jest.fn();
  const rendered = renderScreen(
    <MeetingDetailScreen meetingId={meetingId} onOpenDocument={onOpenDocument} />,
    options,
  );
  rendered.fakes.meetings.addMeeting(MEETING);
  return { ...rendered, onOpenDocument };
}

const renderDetail = (options: RenderScreenOptions = {}) => renderDetailAt(MEETING.id, options);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MeetingDetailScreen', () => {
  it('shows a loading state, then the meeting', async () => {
    renderDetail();
    expect(screen.getByTestId(TEST_IDS.meetingLoading)).toBeTruthy();

    await screen.findByTestId(TEST_IDS.meetingDetail);

    expect(screen.queryByTestId(TEST_IDS.meetingLoading)).toBeNull();
  });

  describe('the header', () => {
    it('shows the title as a header, the date and the location', async () => {
      const { format } = renderDetail();

      const title = await screen.findByRole('header', { name: MEETING.title });

      expect(title).toBeTruthy();
      expect(screen.getByText(format.fullDateTime(MEETING.scheduledAt))).toBeTruthy();
      expect(screen.getByText(MEETING.location)).toBeTruthy();
    });

    it('marks the sections as headers', async () => {
      const { t } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      for (const key of ['meeting.agenda', 'meeting.documents', 'meeting.participants'] as const) {
        expect(screen.getByRole('header', { name: t(key) })).toBeTruthy();
      }
    });
  });

  describe('the agenda', () => {
    it('lists the items in order, numbered by their position', async () => {
      renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const items = screen.getAllByTestId(/^agenda-item-/).map((item) => item.props.testID);

      expect(items).toEqual([
        agendaItemTestId('opening'),
        agendaItemTestId('budget'),
        agendaItemTestId('elections'),
      ]);
      expect(screen.getByText('1. Opening')).toBeTruthy();
      expect(screen.getByText('2. Budget')).toBeTruthy();
      expect(screen.getByText('3. Elections')).toBeTruthy();
      expect(screen.getByText('Welcome and apologies.')).toBeTruthy();
    });

    it('shows the resolution of an item: where voting stands, its deadline and the vote of the user', async () => {
      const { t, format } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const open = screen.getByTestId(resolutionTestId('budget-vote'));

      expect(within(open).getByText('Approve the budget')).toBeTruthy();
      expect(within(open).getByText(t('votingState.open'))).toBeTruthy();
      expect(
        within(open).getByText(t('meeting.votingDeadline', { date: format.dateTime(CLOSES_AT) })),
      ).toBeTruthy();
      expect(
        within(open).getByText(
          t('meeting.resolutionYourVote', { choice: t('voteChoice.against') }),
        ),
      ).toBeTruthy();
    });

    it('shows a closed resolution the user did not vote on, without a date it has none to give', async () => {
      const { t } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const closed = screen.getByTestId(resolutionTestId('elections-vote'));

      expect(within(closed).getByText(t('votingState.closed'))).toBeTruthy();
      // Said once the outbox is known: a vote that waits would change it.
      expect(await within(closed).findByText(t('meeting.resolutionNoVote'))).toBeTruthy();
      expect(within(closed).queryByText(/Vote by|Closed on/)).toBeNull();
    });

    it('shows no resolution for an item that has none', async () => {
      renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      expect(
        within(screen.getByTestId(agendaItemTestId('opening'))).queryByTestId(
          resolutionTestId('budget-vote'),
        ),
      ).toBeNull();
    });
  });

  describe('the documents', () => {
    it('shows the title, the confidentiality and the number of pages of each', async () => {
      const { t } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const report = screen.getByTestId(documentTestId('report'));
      const pack = screen.getByTestId(documentTestId('pack'));

      expect(within(report).getByText('Remuneration report')).toBeTruthy();
      expect(
        within(report).getByText(t(`confidentiality.${CONFIDENTIALITY_LEVEL.Confidential}`)),
      ).toBeTruthy();
      expect(within(report).getByText('12 pages')).toBeTruthy();
      expect(within(pack).getByText(t('confidentiality.internal'))).toBeTruthy();
      expect(within(pack).getByText('1 page')).toBeTruthy();
    });
  });

  describe('the participants', () => {
    it('shows the name and the role of each', async () => {
      const { t } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const bruno = screen.getByTestId(participantTestId('user-2'));

      expect(within(bruno).getByText('Bruno Durand')).toBeTruthy();
      expect(within(bruno).getByText(t('participantRole.chair'))).toBeTruthy();
      expect(
        within(screen.getByTestId(participantTestId('user-4'))).getByText(
          t('participantRole.guest'),
        ),
      ).toBeTruthy();
      expect(
        within(screen.getByTestId(participantTestId('user-1'))).getByText(
          t('participantRole.member'),
        ),
      ).toBeTruthy();
    });
  });

  describe('opening a document', () => {
    it('makes each document a button that opens it, and nothing else on the screen a button', async () => {
      const { onOpenDocument } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const buttons = screen.getAllByRole('button');
      fireEvent.press(screen.getByTestId(documentTestId('report')));

      expect(buttons.map((button) => button.props.testID)).toEqual([
        documentTestId('report'),
        documentTestId('pack'),
      ]);
      expect(onOpenDocument).toHaveBeenCalledTimes(1);
      expect(onOpenDocument).toHaveBeenCalledWith('report');
    });

    it('names a document by its title, its confidentiality and its pages, and says where it leads', async () => {
      const { t } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const report = screen.getByTestId(documentTestId('report'));

      expect(report.props.accessibilityLabel).toBe(
        `Remuneration report, ${t('confidentiality.confidential')}, 12 pages`,
      );
      expect(report.props.accessibilityHint).toBe(t('meeting.openDocumentHint'));
    });
  });

  describe('the states', () => {
    it('says the meeting is not found when the server does not have it, with no way to retry', async () => {
      const { fakes, t } = renderDetail();
      fakes.meetings.removeMeeting(MEETING.id);

      const notFound = await screen.findByTestId(TEST_IDS.meetingNotFound);

      expect(within(notFound).getByText(t('errors.notFound'))).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
      expect(fakes.meetings.getCalls).toHaveLength(1);
    });

    it.each([
      ['no identifier', undefined],
      ['a blank identifier', '   '],
      ['an empty identifier', ''],
    ])('says the meeting is not found for %s, without asking the server', (_name, meetingId) => {
      const { fakes } = renderDetailAt(meetingId);

      expect(screen.getByTestId(TEST_IDS.meetingNotFound)).toBeTruthy();
      expect(fakes.meetings.getCalls).toEqual([]);
    });

    it('says the meeting is forbidden to the user, with no way to retry, and drops the saved copy', async () => {
      const { fakes, t } = renderDetail();
      await fakes.meetingCache.saveMeeting(aUserId(), MEETING, NOW);
      fakes.meetings.forbid(MEETING.id);

      const error = await screen.findByTestId(TEST_IDS.meetingError);

      expect(within(error).getByText(t('errors.forbidden'))).toBeTruthy();
      expect(within(error).queryByRole('button')).toBeNull();
      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('sends the user to the lock screen, without asking the server, when the app is locked', async () => {
      const { fakes, uiStore } = renderDetail();
      fakes.appLock.lock();

      await waitFor(() => {
        expect(uiStore.getState().access).toBe(ACCESS.Locked);
      });

      expect(uiStore.getState().sessionEndedBy).toBe('appLocked');
      expect(fakes.meetings.getCalls).toEqual([]);
    });

    it('shows an error with a way to retry, and the meeting when the retry succeeds', async () => {
      const { fakes, t } = renderDetail();
      fakes.meetings.failure = unexpected();

      const error = await screen.findByTestId(TEST_IDS.meetingError);
      expect(within(error).getByText(t('errors.unexpected'))).toBeTruthy();

      fakes.meetings.failure = undefined;
      fireEvent.press(within(error).getByRole('button', { name: t('states.retry') }));

      await screen.findByTestId(TEST_IDS.meetingDetail);
      expect(screen.queryByTestId(TEST_IDS.meetingError)).toBeNull();
    });

    it('keeps the meeting on the screen, with an error, when a refresh fails', async () => {
      const { fakes, queryClient, t } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);
      fakes.meetings.failure = unexpected();

      act(() => {
        void queryClient.refetchQueries();
      });

      const error = await screen.findByTestId(TEST_IDS.refreshError);
      expect(within(error).getByText(t('errors.unexpected'))).toBeTruthy();
      expect(screen.getByTestId(TEST_IDS.meetingDetail)).toBeTruthy();
    });

    it('shows no banner for a meeting fresh from the server', async () => {
      renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      expect(screen.queryByTestId(TEST_IDS.staleBanner)).toBeNull();
    });

    it('says since when a meeting is a saved copy, when the server cannot be reached', async () => {
      const { fakes, t, format } = renderDetail();
      await fakes.meetingCache.saveMeeting(aUserId(), MEETING, NOW);
      fakes.auth.session = aSession({ expiresAt: at(2 * MILLIS_PER_DAY) });
      fakes.clock.advance(MILLIS_PER_DAY);
      fakes.network.goOffline();

      const banner = await screen.findByTestId(TEST_IDS.staleBanner);

      expect(
        within(banner).getByText(t('states.staleData', { date: format.dateTime(NOW) })),
      ).toBeTruthy();
      expect(screen.getByRole('header', { name: MEETING.title })).toBeTruthy();
      expect(screen.getByTestId(agendaItemTestId('budget'))).toBeTruthy();
    });

    it('reads the meeting again on a pull to refresh, and drops the banner once the server answers', async () => {
      const { fakes } = renderDetail();
      await fakes.meetingCache.saveMeeting(aUserId(), MEETING, NOW);
      fakes.network.goOffline();
      await screen.findByTestId(TEST_IDS.staleBanner);

      fakes.network.goOnline();
      act(() => {
        screen.getByTestId(TEST_IDS.meetingDetail).props.refreshControl.props.onRefresh();
      });

      await waitFor(() => {
        expect(screen.queryByTestId(TEST_IDS.staleBanner)).toBeNull();
      });
      expect(screen.getByRole('header', { name: MEETING.title })).toBeTruthy();
    });

    it('shows the network error of a meeting that was never saved', async () => {
      const { fakes, t } = renderDetail();
      fakes.network.goOffline();

      const error = await screen.findByTestId(TEST_IDS.meetingError);

      expect(within(error).getByText(t('errors.networkUnavailable'))).toBeTruthy();
    });
  });

  describe('in each language', () => {
    it.each(SUPPORTED_LANGUAGES)('shows the sections and the codes in %s', async (language) => {
      const { t } = renderDetail({ language });
      await screen.findByTestId(TEST_IDS.meetingDetail);

      expect(screen.getByRole('header', { name: t('meeting.agenda') })).toBeTruthy();
      expect(screen.getByText(t('participantRole.chair'))).toBeTruthy();
      expect(
        screen.getByText(t('meeting.resolutionYourVote', { choice: t('voteChoice.against') })),
      ).toBeTruthy();
    });

    it('translates the meeting into French: sections, roles, statuses, vote and plurals', async () => {
      renderDetail({ language: 'fr' });
      await screen.findByTestId(TEST_IDS.meetingDetail);

      expect(screen.getByRole('header', { name: 'Ordre du jour' })).toBeTruthy();
      expect(screen.getByRole('header', { name: 'Participants' })).toBeTruthy();
      expect(screen.getByText('Présidence')).toBeTruthy();
      expect(screen.getByText('Personne invitée')).toBeTruthy();
      expect(screen.getByText('Confidentiel')).toBeTruthy();
      expect(screen.getByText('Ouverte')).toBeTruthy();
      expect(screen.getByText('Clôturée')).toBeTruthy();
      expect(screen.getByText('Votre vote\u00a0: Contre')).toBeTruthy();
      expect(screen.getByText('12 pages')).toBeTruthy();
      expect(screen.getByText('1 page')).toBeTruthy();
      expect(await screen.findByText('Vous n’avez pas voté.')).toBeTruthy();
    });

    it('translates a meeting that is not found into French', async () => {
      const { fakes } = renderDetailAt(aMeetingId('unknown'), { language: 'fr' });
      fakes.meetings.removeMeeting(MEETING.id);

      await screen.findByText('Cette réunion n’existe pas, ou vous n’y avez plus accès.');
    });
  });

  describe('where voting stands', () => {
    /** The world of the use cases with the clock at `instant`, and a session that outlasts it. */
    function fakesAt(instant: number) {
      const fakes = createFakes();
      fakes.auth.session = aSession({ expiresAt: at(30 * MILLIS_PER_DAY) });
      fakes.clock.set(at(instant));
      return fakes;
    }

    it('shows the voting as ended, and not as open, once the window has passed at the instant of the load', async () => {
      const { t, format } = renderDetail({ fakes: fakesAt(2 * MILLIS_PER_DAY) });
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const budget = screen.getByTestId(resolutionTestId('budget-vote'));

      expect(within(budget).queryByText(t('votingState.open'))).toBeNull();
      expect(within(budget).getByText(t('votingState.windowOver'))).toBeTruthy();
      expect(
        within(budget).getByText(t('meeting.votingClosedOn', { date: format.dateTime(CLOSES_AT) })),
      ).toBeTruthy();
    });

    it('judges a saved copy at the instant it is shown at, not at the instant it was saved', async () => {
      const fakes = fakesAt(2 * MILLIS_PER_DAY);
      await fakes.meetingCache.saveMeeting(aUserId(), MEETING, NOW);
      fakes.network.goOffline();
      const { t } = renderDetail({ fakes });

      await screen.findByTestId(TEST_IDS.staleBanner);

      const budget = screen.getByTestId(resolutionTestId('budget-vote'));
      expect(within(budget).getByText(t('votingState.windowOver'))).toBeTruthy();
      expect(within(budget).queryByText(t('votingState.open'))).toBeNull();
    });

    it('keeps the state it had at the load until the meeting is loaded again', async () => {
      const fakes = fakesAt(MILLIS_PER_HOUR);
      const { t, queryClient } = renderDetail({ fakes });
      await screen.findByTestId(TEST_IDS.meetingDetail);
      const budget = screen.getByTestId(resolutionTestId('budget-vote'));
      expect(within(budget).getByText(t('votingState.open'))).toBeTruthy();

      fakes.clock.set(at(2 * MILLIS_PER_DAY));
      await act(async () => {
        jest.advanceTimersByTime(MILLIS_PER_HOUR);
      });
      expect(within(budget).getByText(t('votingState.open'))).toBeTruthy();

      act(() => {
        void queryClient.refetchQueries();
      });
      await waitFor(() => {
        expect(
          within(screen.getByTestId(resolutionTestId('budget-vote'))).getByText(
            t('votingState.windowOver'),
          ),
        ).toBeTruthy();
      });
    });
  });

  describe('for the screen reader and the region', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('tells that the meeting is loading, as a busy progress bar with a name', () => {
      const { t } = renderDetail();

      const progress = screen.getByRole('progressbar', { name: t('meeting.loading') });

      expect(progress.props.accessibilityState).toEqual({ busy: true });
    });

    it('announces on iOS that it is refreshing', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      const { t } = renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);
      announce.mockClear();

      await act(async () => {
        screen.getByTestId(TEST_IDS.meetingDetail).props.refreshControl.props.onRefresh();
      });

      expect(announce).toHaveBeenCalledWith(t('states.refreshing'));
    });

    it('writes the number of pages with the grouping of the locale', async () => {
      const { fakes } = renderDetail();
      fakes.meetings.addMeeting(
        unwrap(
          createMeeting({
            summary: MEETING,
            agenda: [],
            documents: [
              aDocument({ id: aDocumentId('big'), title: 'Annual record', pageCount: 4321 }),
            ],
            participants: MEETING.participants,
          }),
        ),
      );
      await screen.findByTestId(TEST_IDS.meetingDetail);

      expect(
        within(screen.getByTestId(documentTestId('big'))).getByText('4,321 pages'),
      ).toBeTruthy();
    });

    it('writes the dates the way the region of the device does', async () => {
      setDeviceLanguages('en-GB');
      renderDetail();
      await screen.findByTestId(TEST_IDS.meetingDetail);

      const british = createFormatters('en-GB').fullDateTime(MEETING.scheduledAt);

      expect(british).not.toBe(createFormatters('en').fullDateTime(MEETING.scheduledAt));
      expect(screen.getByText(british)).toBeTruthy();
    });
  });
});
