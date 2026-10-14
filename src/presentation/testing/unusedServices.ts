import { NOW } from '@domain/testing/builders';

import type { AppServices, UseCases } from '../services/AppServices';

// Test support, not production code: only tests import it (a lint rule enforces it).

const unused = { execute: () => Promise.reject(new Error('unused')) };

/** Every use case rejects: for a test of the plumbing that must not call any of them. */
const UNUSED_USE_CASES: UseCases = {
  restoreSession: unused,
  signIn: unused,
  signOut: unused,
  evaluateAppLock: unused,
  unlockApp: unused,
  getCurrentUser: unused,
  listMeetings: unused,
  getMeeting: unused,
  observeConnectivity: unused,
  castVote: unused,
  syncPendingVotes: unused,
  listPendingVotes: unused,
  acknowledgeRejectedVote: unused,
  discardUnreadableVotes: unused,
};

/** Services whose use cases all reject, with the page size a test asks for. */
export function unusedServices(meetingsPageSize: number): AppServices {
  return {
    useCases: UNUSED_USE_CASES,
    settings: { meetingsPageSize },
    clock: { now: () => NOW },
  };
}
