/**
 * English resource, and the source of truth for the set of translation keys: every other language
 * is typed against its shape (see `translation.ts`).
 *
 * Plural keys follow the i18next convention: one entry per plural category, suffixed with `_one`,
 * `_many`, `_other`, and so on. Every plural key lists the categories of every supported language,
 * because the other languages are typed against this shape. English itself only selects `one`
 * and `other`: its `_many` entry is never shown, it exists for the French resource.
 *
 * The groups `participantRole`, `resolutionStatus`, `confidentiality`, `voteChoice` and `errors`
 * translate the codes of the domain and the application. They are reached through the typed maps
 * of `translationKeys.ts`, never by building a key from a code.
 */
export const en = {
  app: {
    name: 'Boardroom',
  },
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
    loadMoreFailed: 'The next meetings could not be loaded.',
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
    resolutionClosesAt: 'Voting closes {{date}}',
    resolutionYourVote: 'Your vote: {{choice}}',
    resolutionNoVote: 'You have not voted.',
    pageCount_one: '{{count}} page',
    pageCount_many: '{{count}} pages',
    pageCount_other: '{{count}} pages',
  },
  states: {
    retry: 'Try again',
    staleData: 'Showing saved data from {{date}}',
  },
  participantRole: {
    chair: 'Chair',
    secretary: 'Secretary',
    member: 'Member',
    guest: 'Guest',
  },
  resolutionStatus: {
    open: 'Open',
    closed: 'Closed',
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
    unauthorized: 'You are not allowed to see this. Sign in again.',
    notAuthenticated: 'You are signed out. Sign in to continue.',
    sessionExpired: 'Your session has expired. Sign in again.',
    notFound: 'This meeting does not exist, or you no longer have access to it.',
    unexpected: 'Something went wrong on our side. Try again in a moment.',
    storageReadFailed: 'The data saved on this device could not be read.',
    validation: 'The request was not valid.',
  },
  startup: {
    title: 'Boardroom cannot start',
    message:
      'The app is not configured correctly. Check the EXPO_PUBLIC_BOARDROOM_ADAPTERS setting: it accepts mock (the default) or http, which is not available yet.',
    code: 'Technical code: {{code}}',
  },
} as const;
