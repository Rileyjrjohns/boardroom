import type { MeetingId } from '@core/domain/value-objects/ids';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

/** The test IDs of the screens of the meetings. The ones that depend on an item are built by the functions below. */
export const MEETINGS_TEST_IDS = {
  meetingsList: 'meetings-list',
  meetingsLoading: 'meetings-loading',
  meetingsEmpty: 'meetings-empty',
  meetingsError: 'meetings-error',
  meetingsEnd: 'meetings-end',
  meetingsLoadingMore: 'meetings-loading-more',
  meetingsLoadMoreError: 'meetings-load-more-error',
  meetingDetail: 'meeting-detail',
  meetingLoading: 'meeting-loading',
  meetingError: 'meeting-error',
  meetingNotFound: 'meeting-not-found',
  meetingTitle: 'meeting-title',
  agendaSection: 'agenda-section',
  documentsSection: 'documents-section',
  participantsSection: 'participants-section',
} as const;

export const MEETING_ROW_TEST_ID_PREFIX = 'meeting-row-';
const PERIOD_OPTION_PREFIX = 'period-option-';
const AGENDA_ITEM_PREFIX = 'agenda-item-';
const RESOLUTION_PREFIX = 'resolution-';
const DOCUMENT_PREFIX = 'document-';
const PARTICIPANT_PREFIX = 'participant-';

export const meetingRowTestId = (id: MeetingId): string => `${MEETING_ROW_TEST_ID_PREFIX}${id}`;
export const periodOptionTestId = (period: MeetingPeriod): string =>
  `${PERIOD_OPTION_PREFIX}${period}`;
export const agendaItemTestId = (id: string): string => `${AGENDA_ITEM_PREFIX}${id}`;
export const resolutionTestId = (id: string): string => `${RESOLUTION_PREFIX}${id}`;
export const documentTestId = (id: string): string => `${DOCUMENT_PREFIX}${id}`;
export const participantTestId = (userId: string): string => `${PARTICIPANT_PREFIX}${userId}`;
