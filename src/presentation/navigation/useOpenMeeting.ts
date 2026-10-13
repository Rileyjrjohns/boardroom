import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { MeetingId } from '@domain/value-objects/ids';

import { ROUTES, ROUTE_PARAMS } from './routes';

/** Opens the detail of a meeting. The callback is stable, so the rows of a list are not re-rendered for it. */
export function useOpenMeeting(): (id: MeetingId) => void {
  const router = useRouter();

  return useCallback(
    (id) => {
      router.push({ pathname: ROUTES.meetingDetail, params: { [ROUTE_PARAMS.meetingId]: id } });
    },
    [router],
  );
}
