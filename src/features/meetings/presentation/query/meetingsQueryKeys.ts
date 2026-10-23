import type { MeetingId } from '@core/domain/value-objects/ids';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

const SCOPE = 'meetings';

const KIND = {
  List: 'list',
  Detail: 'detail',
} as const;

/**
 * The query keys of the meetings, built here and nowhere else, so that a key is never spelled
 * twice. The lists and the details start with the same scope, so a family can be reached by its
 * prefix.
 *
 * The key holds what the data depends on. The user is not in it: the query client is created per
 * app instance and holds the data of one session at a time. What keeps it so is that the cache is
 * emptied when the session ends: by the client itself when a failure says the session is over
 * (see `createQueryClient`), and by `discardSessionData`, which `createAppState` calls whenever the
 * user leaves the open app (a sign-out, a lock). Without that call, a second user would be shown
 * the rows of the first until their own request answers (`failures.test.tsx` shows it).
 */
export const meetingsQueryKeys = {
  /** A period of the list, at a page size. The pages are the pages of one infinite query. */
  list: (period: MeetingPeriod, pageSize: number) => [SCOPE, KIND.List, period, pageSize] as const,
  detail: (meetingId: MeetingId) => [SCOPE, KIND.Detail, meetingId] as const,
  /** Every meeting held, whichever it is: what a synchronisation refreshes. */
  details: () => [SCOPE, KIND.Detail] as const,
} as const;
