import { screen } from '@testing-library/react-native';

import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { aResolution } from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';

import { ResolutionVoteLine } from './ResolutionVoteLine';

describe('ResolutionVoteLine', () => {
  it('tells the vote the server recorded', () => {
    const { t } = renderScreen(
      <ResolutionVoteLine resolution={aResolution({ recordedVote: VOTE_CHOICE.For })} />,
    );

    expect(
      screen.getByText(t('meeting.resolutionYourVote', { choice: t('voteChoice.for') })),
    ).toBeTruthy();
  });

  it('tells that the user has not voted, when nothing is recorded and nothing waits', () => {
    const { t } = renderScreen(<ResolutionVoteLine resolution={aResolution()} />);

    expect(screen.getByText(t('meeting.resolutionNoVote'))).toBeTruthy();
  });

  it('tells the vote that waits to be sent, when whoever knows the outbox says so', () => {
    const { t } = renderScreen(
      <ResolutionVoteLine resolution={aResolution()} queuedChoice={VOTE_CHOICE.Abstain} />,
    );

    expect(
      screen.getByText(t('meeting.resolutionYourVoteQueued', { choice: t('voteChoice.abstain') })),
    ).toBeTruthy();
  });

  it('says the recorded vote before the one that waits: the server has the last word', () => {
    const { t } = renderScreen(
      <ResolutionVoteLine
        resolution={aResolution({ recordedVote: VOTE_CHOICE.Against })}
        queuedChoice={VOTE_CHOICE.For}
      />,
    );

    expect(
      screen.getByText(t('meeting.resolutionYourVote', { choice: t('voteChoice.against') })),
    ).toBeTruthy();
    expect(screen.queryByText(/waiting/i)).toBeNull();
  });

  it('says nothing while the vote is not known: "you have not voted" would be a guess', () => {
    renderScreen(<ResolutionVoteLine resolution={aResolution()} unknown />);

    expect(screen.queryByText(/voted/i)).toBeNull();
  });
});
