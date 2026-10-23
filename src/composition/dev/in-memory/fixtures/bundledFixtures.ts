import accounts from '../../../../../docs/spec/fixtures/accounts.json' with { type: 'json' };
import meetings from '../../../../../docs/spec/fixtures/meetings.json' with { type: 'json' };
import recordedVotes from '../../../../../docs/spec/fixtures/recorded-votes.json' with { type: 'json' };

import type { FixtureFiles } from './loadFixtures';

// The fixtures that ship with the app: the files of docs/spec/fixtures, which are bundled as they
// are (Metro, Jest and Node all read a JSON module). This is the one module that imports them, and
// it hands them over as they come, unchecked: `loadFixtures` validates them.

export const BUNDLED_FIXTURES: FixtureFiles = { accounts, meetings, recordedVotes };
