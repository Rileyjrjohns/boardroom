import { screen, within } from '@testing-library/react-native';

import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import { VOTING_STATE } from '@domain/policies/votingState';
import { MILLIS_PER_DAY, NOW, aResolution, at } from '@domain/testing/builders';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { resolutionTestId } from '../testIds';
import { renderScreen } from '../testing/renderScreen';
import { colors } from '../theme/tokens';

import { ResolutionView } from './ResolutionView';

// Where voting stands is told by the rule of the domain, at the instant the data was produced at.
// The component reads no clock: given the same resolution at two instants, it shows two states.

const CLOSES_AT = at(MILLIS_PER_DAY);
const BEFORE = NOW;
const AFTER = at(2 * MILLIS_PER_DAY);

function renderResolution(
  overrides: Parameters<typeof aResolution>[0],
  now = BEFORE,
  language: 'en' | 'fr' = 'en',
) {
  const resolution = aResolution(overrides);
  const rendered = renderScreen(<ResolutionView resolution={resolution} now={now} />, {
    language,
  });
  return { ...rendered, view: screen.getByTestId(resolutionTestId(resolution.id)) };
}

describe('ResolutionView', () => {
  describe('an open resolution', () => {
    it('says it is open, in green, with the deadline of the vote', () => {
      const { t, format, view } = renderResolution({ closesAt: CLOSES_AT });

      expect(within(view).getByText(t('votingState.open'))).toHaveStyle({
        color: colors.positiveBadgeText,
      });
      expect(
        within(view).getByText(t('meeting.votingDeadline', { date: format.dateTime(CLOSES_AT) })),
      ).toBeTruthy();
    });

    it('has no date to show when it has no closing instant', () => {
      const { t, view } = renderResolution({});

      expect(within(view).getByText(t('votingState.open'))).toBeTruthy();
      expect(within(view).queryByText(/Vote by|Closed on/)).toBeNull();
    });
  });

  describe('a resolution that is open but whose window is over', () => {
    it('does not say it is open: it says the voting ended, in neutral, with the date it closed on', () => {
      const { t, format, view } = renderResolution({ closesAt: CLOSES_AT }, AFTER);

      expect(within(view).queryByText(t('votingState.open'))).toBeNull();
      expect(within(view).getByText(t('votingState.windowOver'))).toHaveStyle({
        color: colors.neutralBadgeText,
      });
      expect(
        within(view).getByText(t('meeting.votingClosedOn', { date: format.dateTime(CLOSES_AT) })),
      ).toBeTruthy();
      expect(within(view).queryByText(/Vote by/)).toBeNull();
    });

    it('is judged at the instant it is given: the same resolution is open a moment before', () => {
      const { t, view } = renderResolution({ closesAt: CLOSES_AT }, at(MILLIS_PER_DAY - 1));

      expect(within(view).getByText(t('votingState.open'))).toBeTruthy();
    });

    it('is over at the closing instant itself, as it is for the eligibility to vote', () => {
      const { t, view } = renderResolution({ closesAt: CLOSES_AT }, CLOSES_AT);

      expect(within(view).getByText(t('votingState.windowOver'))).toBeTruthy();
    });
  });

  describe('a closed resolution', () => {
    it('says it is closed, in neutral, and never speaks of a deadline', () => {
      const { t, format, view } = renderResolution({
        status: RESOLUTION_STATUS.Closed,
        closesAt: at(-MILLIS_PER_DAY),
      });

      expect(within(view).getByText(t('votingState.closed'))).toHaveStyle({
        color: colors.neutralBadgeText,
      });
      expect(
        within(view).getByText(
          t('meeting.votingClosedOn', { date: format.dateTime(at(-MILLIS_PER_DAY)) }),
        ),
      ).toBeTruthy();
      expect(within(view).queryByText(/Vote by/)).toBeNull();
    });
  });

  it('is told with the same rule as the eligibility to vote', () => {
    // The states are those of the domain: one word for each, in each language.
    for (const state of Object.values(VOTING_STATE)) {
      expect(state).toBeTruthy();
    }
    expect(Object.values(VOTING_STATE)).toHaveLength(3);
  });

  it('shows the vote of the user, or that there is none', () => {
    const voted = renderResolution({ recordedVote: VOTE_CHOICE.Against });
    expect(
      within(voted.view).getByText(
        voted.t('meeting.resolutionYourVote', { choice: voted.t('voteChoice.against') }),
      ),
    ).toBeTruthy();
  });

  it.each(SUPPORTED_LANGUAGES)('is written in %s', (language) => {
    const { t, view } = renderResolution({ closesAt: CLOSES_AT }, AFTER, language);

    expect(within(view).getByText(t('votingState.windowOver'))).toBeTruthy();
    expect(within(view).getByText(t('meeting.resolutionNoVote'))).toBeTruthy();
  });

  it('says in French that the window is over, and when', () => {
    const { view, format } = renderResolution({ closesAt: CLOSES_AT }, AFTER, 'fr');

    expect(within(view).getByText('Délai écoulé')).toBeTruthy();
    expect(within(view).getByText(`Clôturée le ${format.dateTime(CLOSES_AT)}`)).toBeTruthy();
  });
});
