import type { ValueOf } from '@domain/shared/constants';

/** What is being cached, for the logs. */
export const CACHE_RESOURCE = {
  MeetingPage: 'meetingPage',
  Meeting: 'meeting',
  Document: 'document',
} as const;

export type CacheResource = ValueOf<typeof CACHE_RESOURCE>;
