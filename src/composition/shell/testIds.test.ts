import { CORE_TEST_IDS } from '@core/presentation/testIds';
import { AUTH_TEST_IDS } from '@features/auth/presentation/testIds';
import { DOCUMENTS_TEST_IDS } from '@features/documents/presentation/testIds';
import { MEETINGS_TEST_IDS } from '@features/meetings/presentation/testIds';
import { VOTES_TEST_IDS } from '@features/votes/presentation/testIds';

import { SHELL_TEST_IDS, TEST_IDS } from './testIds';

// Each feature declares the test ids of its own screens, and the composition puts them all
// together. They share one screen at a time, so a name or a value that two of them declare would
// be silently replaced by the other's in the registry the specification is compared with.

const DECLARED = {
  core: CORE_TEST_IDS,
  shell: SHELL_TEST_IDS,
  auth: AUTH_TEST_IDS,
  meetings: MEETINGS_TEST_IDS,
  documents: DOCUMENTS_TEST_IDS,
  votes: VOTES_TEST_IDS,
} as const;

describe('the test ids of the app', () => {
  it('are the ones every owner declares, no more, no fewer', () => {
    const declared = Object.values(DECLARED).flatMap((ids) => Object.keys(ids));

    expect(Object.keys(TEST_IDS).sort()).toEqual(declared.sort());
  });

  it('never share a name between two owners', () => {
    const names = Object.values(DECLARED).flatMap((ids) => Object.keys(ids));

    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it('never share a value between two owners: a test id points at one element', () => {
    const values = Object.values(TEST_IDS);

    expect(values.filter((value, index) => values.indexOf(value) !== index)).toEqual([]);
  });
});
