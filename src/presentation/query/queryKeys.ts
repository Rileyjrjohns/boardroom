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
 * Every query key of the app, built here and nowhere else, so that a key is never spelled twice
 * and a mutation can invalidate a whole family by its prefix: `queryKeys.meetings.all()` is the
 * prefix of the lists and of the details alike.
 *
 * The key holds what the data depends on. The user is not in it: the query client is created per
 * app instance and emptied when the session ends (sign-out arrives with step 4, which owns that
 * call), so it only ever holds the data of the signed-in user.
 */
export const queryKeys = {
  meetings: {
    all: () => [SCOPE.Meetings] as const,
    /** A period of the list, at a page size. The pages are the pages of one infinite query. */
    list: (period: MeetingPeriod, pageSize: number) =>
      [SCOPE.Meetings, KIND.List, period, pageSize] as const,
    detail: (meetingId: MeetingId) => [SCOPE.Meetings, KIND.Detail, meetingId] as const,
  },
} as const;
