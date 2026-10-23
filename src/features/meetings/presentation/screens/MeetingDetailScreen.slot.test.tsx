import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { VOTES_TEST_IDS, voteChoicesTestId } from '@features/votes/presentation/testIds';
import { aMeetingWithAgenda } from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';

import { ResolutionActionsProvider } from '../slots/resolutionActions';
import type { ResolutionActionsSlot } from '../slots/resolutionActions';
import { MEETINGS_TEST_IDS } from '../testIds';

import { MeetingDetailScreen } from './MeetingDetailScreen';

// The meetings show what a feature plugs into their resolutions, and know nothing of the votes:
// the slot of these tests is made of two sentences. (The votes in the slot are tested in
// MeetingDetailScreen.voting.test.tsx.)

const MEETING = aMeetingWithAgenda();

const NOTICE = 'A notice for the whole meeting';
const ACTIONS = 'Something to do about';

const actionsText = (title: string): string => `${ACTIONS} ${title}`;

const SLOT: ResolutionActionsSlot = {
  useMeetingActions: () => ({
    notice: <Text>{NOTICE}</Text>,
    renderResolutionActions: (resolution) => <Text>{actionsText(resolution.title)}</Text>,
  }),
};

const DISPLAY_ONLY: ResolutionActionsSlot = {
  useMeetingActions: () => ({ notice: null, renderResolutionActions: () => undefined }),
};

function renderWith(slot: ResolutionActionsSlot) {
  const rendered = renderScreen(
    <ResolutionActionsProvider slot={slot}>
      <MeetingDetailScreen meetingId={MEETING.id} onOpenDocument={jest.fn()} />
    </ResolutionActionsProvider>,
  );
  rendered.fakes.meetings.addMeeting(MEETING);
  return rendered;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MeetingDetailScreen, with a feature plugged into its resolutions', () => {
  it('shows the notice of the feature with the other notices of the meeting', async () => {
    renderWith(SLOT);
    await screen.findByTestId(MEETINGS_TEST_IDS.meetingDetail);

    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it('shows what the feature adds under each resolution, in the place of the line about the vote', async () => {
    const { t } = renderWith(SLOT);
    await screen.findByTestId(MEETINGS_TEST_IDS.meetingDetail);

    for (const item of MEETING.agenda) {
      if (item.resolution === undefined) continue;
      expect(screen.getByText(actionsText(item.resolution.title))).toBeTruthy();
    }
    expect(screen.queryByText(t('meeting.resolutionNoVote'))).toBeNull();
  });

  it('is display only when the feature adds nothing: the vote the server recorded, and nothing to do', async () => {
    const { t } = renderWith(DISPLAY_ONLY);
    await screen.findByTestId(MEETINGS_TEST_IDS.meetingDetail);

    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getAllByText(t('meeting.resolutionNoVote')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId(VOTES_TEST_IDS.votingLoading)).toBeNull();
    for (const item of MEETING.agenda) {
      if (item.resolution !== undefined) {
        expect(screen.queryByTestId(voteChoicesTestId(item.resolution.id))).toBeNull();
      }
    }
  });
});
