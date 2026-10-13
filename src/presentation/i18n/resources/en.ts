/**
 * English resource, and the source of truth for the set of translation keys: every other language
 * is typed against its shape (see `translation.ts`).
 *
 * Plural keys follow the i18next convention: one entry per plural category, suffixed with `_one`,
 * `_many`, `_other`, and so on. Every plural key lists the categories of every supported language,
 * because the other languages are typed against this shape. English itself only selects `one`
 * and `other`: its `_many` entry is never shown, it exists for the French resource.
 *
 * The groups `participantRole`, `votingState`, `confidentiality`, `voteChoice` and `errors`
 * translate the codes of the domain and the application. They are reached through the typed maps
 * of `translationKeys.ts`, never by building a key from a code.
 */
export const en = {
  navigation: {
    meetings: 'Meetings',
    meeting: 'Meeting',
  },
  meetings: {
    period: {
      label: 'Meeting period',
      upcoming: 'Upcoming',
      past: 'Past',
    },
    empty: {
      upcoming: 'No upcoming meetings.',
      past: 'No past meetings.',
    },
    loading: 'Loading meetings',
    loadingMore: 'Loading more meetings',
    endOfList: 'That is all of the meetings.',
    openHint: 'Opens the meeting',
  },
  meeting: {
    loading: 'Loading the meeting',
    agenda: 'Agenda',
    agendaEmpty: 'There is no agenda.',
    agendaItem: '{{position}}. {{title}}',
    documents: 'Documents',
    documentsEmpty: 'There are no documents.',
    participants: 'Participants',
    participantsEmpty: 'There are no participants.',
    votingDeadline: 'Vote by {{date}}',
    votingClosedOn: 'Closed on {{date}}',
    resolutionYourVote: 'Your vote: {{choice}}',
    resolutionNoVote: 'You have not voted.',
    pageCount_one: '{{formattedCount}} page',
    pageCount_many: '{{formattedCount}} pages',
    pageCount_other: '{{formattedCount}} pages',
  },
  states: {
    retry: 'Try again',
    staleData: 'Showing saved data from {{date}}',
    refreshing: 'Refreshing',
  },
  participantRole: {
    chair: 'Chair',
    secretary: 'Secretary',
    member: 'Member',
    guest: 'Guest',
  },
  votingState: {
    open: 'Open',
    closed: 'Closed',
    windowOver: 'Voting ended',
  },
  confidentiality: {
    public: 'Public',
    internal: 'Internal',
    confidential: 'Confidential',
  },
  voteChoice: {
    for: 'For',
    against: 'Against',
    abstain: 'Abstain',
  },
  errors: {
    networkUnavailable: 'The server cannot be reached. Check your connection and try again.',
    unauthorized: 'Your session is no longer valid. Sign in again.',
    forbidden: 'You do not have access to this meeting.',
    notAuthenticated: 'You are signed out. Sign in to continue.',
    sessionExpired: 'Your session has expired. Sign in again.',
    appLocked: 'The app is locked. Unlock it to continue.',
    sessionChanged: 'The signed-in user has changed. Sign in again.',
    notFound: 'This meeting does not exist, or you no longer have access to it.',
    unexpected: 'Something went wrong on our side. Try again in a moment.',
    storageReadFailed: 'The data saved on this device could not be read.',
    validation: 'The request was not valid.',
  },
  startup: {
    title: 'Boardroom cannot start',
    message:
      'The app is not configured correctly. Check the EXPO_PUBLIC_BOARDROOM_ADAPTERS setting: it accepts mock or http, which is not available yet. A development build uses mock when the setting is missing; any other build needs it.',
    code: 'Technical code: {{code}}',
  },
} as const;
