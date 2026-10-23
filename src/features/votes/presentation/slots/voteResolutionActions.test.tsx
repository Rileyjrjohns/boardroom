import { screen, waitFor } from '@testing-library/react-native';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { NOW, aMeeting, aResolution } from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';

import { VOTES_TEST_IDS, voteChoicesTestId } from '../testIds';

import { VOTE_RESOLUTION_ACTIONS } from './voteResolutionActions';

// What the votes plug into the resolutions of the meetings (the slot declared by the meetings): one
// reading of the votes of the user for the whole meeting, the line about their vote and what they
// can do about it under each resolution, and a failure to read them told once, at the top.

const MEETING = aMeeting();
const RESOLUTION = aResolution();

function Probe() {
  const actions = VOTE_RESOLUTION_ACTIONS.useMeetingActions(MEETING, NOW);
  return (
    <>
      {actions.notice}
      {actions.renderResolutionActions(RESOLUTION)}
    </>
  );
}

function renderProbe(options: Parameters<typeof renderScreen>[1] = {}) {
  return renderScreen(<Probe />, { access: ACCESS.Unlocked, ...options });
}

describe('VOTE_RESOLUTION_ACTIONS', () => {
  it('offers the choices under a resolution the user may vote on, once their votes are read', async () => {
    renderProbe();

    expect(await screen.findByTestId(voteChoicesTestId(RESOLUTION.id))).toBeTruthy();
    expect(screen.queryByTestId(VOTES_TEST_IDS.votingError)).toBeNull();
  });

  it('says nothing of the vote of the user, and offers nothing, while their votes are not read', () => {
    const { t } = renderProbe();

    expect(screen.queryByText(t('meeting.resolutionNoVote'))).toBeNull();
    expect(screen.queryByTestId(voteChoicesTestId(RESOLUTION.id))).toBeNull();
  });

  it('tells at the top that the votes could not be read, with a way to try again, and offers nothing meanwhile', async () => {
    const rendered = renderProbe();
    rendered.fakes.auth.readFailure = storageReadFailed();

    await waitFor(() => {
      expect(screen.getByTestId(VOTES_TEST_IDS.votingError)).toBeTruthy();
    });
    expect(screen.queryByTestId(voteChoicesTestId(RESOLUTION.id))).toBeNull();
    expect(screen.getByText(rendered.t('errors.storageReadFailed'))).toBeTruthy();
  });
});
