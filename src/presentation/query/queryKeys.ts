import type { MeetingId } from '@domain/value-objects/ids';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';

const SCOPE = {
  Meetings: 'meetings',
} as const;

const KIND = {
  List: 'list',
  Detail: 'detail',
} as const;

/**
 * Every query key of the app, built here and nowhere else, so that a key is never spelled twice.
 * The lists and the details start with the same scope, so a family can be reached by its prefix.
 *
 * The key holds what the data depends on. The user is not in it: the query client is created per
 * app instance and holds the data of one session at a time. What keeps it so is that the cache is
 * emptied when the session ends: by the client itself when a failure says the session is over
 * (see `createQueryClient`), and by `discardSessionData`, which the sign-out of step 4 must call
 * (nothing signs a user out yet). Without that call, a second user would be shown the rows of the
 * first until their own request answers (`failures.test.tsx` shows it).
 */
export const queryKeys = {
  meetings: {
    /** A period of the list, at a page size. The pages are the pages of one infinite query. */
    list: (period: MeetingPeriod, pageSize: number) =>
      [SCOPE.Meetings, KIND.List, period, pageSize] as const,
    detail: (meetingId: MeetingId) => [SCOPE.Meetings, KIND.Detail, meetingId] as const,
  },
} as const;
