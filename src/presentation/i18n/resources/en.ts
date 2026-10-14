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
  app: {
    name: 'Boardroom',
  },
  common: {
    cancel: 'Cancel',
    close: 'Close',
  },
  navigation: {
    meetings: 'Meetings',
    meeting: 'Meeting',
    signIn: 'Sign in',
    locked: 'Locked',
    pendingVotes: 'Pending votes',
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
    resolutionYourVoteQueued: 'Your vote: {{choice}} (waiting to be sent)',
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
    invalidCredentials: 'The email address or the password is not correct.',
    storageWriteFailed: 'The data could not be saved on this device. Try again.',
    unexpected: 'Something went wrong on our side. Try again in a moment.',
    storageReadFailed: 'The data saved on this device could not be read.',
    validation: 'The request was not valid.',
  },
  startup: {
    loading: 'Starting Boardroom',
    title: 'Boardroom cannot start',
    message:
      'The app is not configured correctly, or the data saved on this device cannot be opened. Check the EXPO_PUBLIC_BOARDROOM_ADAPTERS setting, which accepts mock or http, and for http the EXPO_PUBLIC_BOARDROOM_API_BASE_URL setting: an https address, or http for this computer only. A development build uses mock when the first one is missing; any other build needs it.',
    code: 'Technical code: {{code}}',
    forgetExplanation:
      'If trying again does not help, you can sign out on this device and sign in again. Votes waiting to be sent stay on this device.',
    forget: 'Sign out on this device',
  },
  biometric: {
    unlockApp: 'Unlock Boardroom',
    confirmVote: 'Confirm your vote',
  },
  signIn: {
    title: 'Sign in to Boardroom',
    message: 'Use the account of your organisation to see your meetings and vote.',
    email: 'Email address',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter a valid email address, such as name@company.com.',
    emailTooLong: 'This email address is too long.',
    passwordRequired: 'Enter your password.',
  },
  lock: {
    title: 'Boardroom is locked',
    message:
      'Boardroom locks itself when it starts and when you have been away for a while. Unlock it to see your meetings.',
    unlock: 'Unlock',
    unlockHint: 'Opens the fingerprint or face prompt of your device.',
    unlocking: 'Unlocking',
  },
  unlockErrors: {
    biometricUnavailable:
      'Biometric unlock is not available on this device. Sign out and sign in again to continue.',
    biometricNotEnrolled:
      'No fingerprint or face is registered on this device. Add one in the settings of the device, or sign out and sign in again.',
    biometricCancelled: 'Unlocking was cancelled. Try again when you are ready.',
    biometricFailed: 'You were not recognised. Try again.',
    biometricLockedOut:
      'Too many attempts. Wait a moment, or unlock your device with its passcode, then try again.',
  },
  signOut: {
    action: 'Sign out',
    hint: 'Asks you to confirm.',
    title: 'Sign out of Boardroom?',
    message: 'You will need to sign in again to see your meetings.',
    pending_one:
      '{{formattedCount}} vote is waiting to be sent. It is kept on this device and will be sent after your next sign-in.',
    pending_many:
      '{{formattedCount}} votes are waiting to be sent. They are kept on this device and will be sent after your next sign-in.',
    pending_other:
      '{{formattedCount}} votes are waiting to be sent. They are kept on this device and will be sent after your next sign-in.',
    pendingUnknown:
      'Any vote waiting to be sent is kept on this device and will be sent after your next sign-in.',
    signingOut: 'Signing out',
    failed: 'You could not be signed out. Try again.',
  },
  voting: {
    loading: 'Checking your right to vote',
    choose: 'Cast your vote',
    choiceHint: 'Opens a confirmation step before your vote is cast.',
    confirmTitle: 'Confirm your vote',
    confirmChoice: 'Your choice: {{choice}}',
    confirmFinal: 'Your vote is final. Once cast, it cannot be changed or withdrawn.',
    confirmBiometric: 'Your device will ask for your fingerprint or face to confirm it.',
    confirmOffline:
      'You are offline. Your vote will be saved on this device and sent when the connection returns.',
    confirm: 'Confirm my vote',
    confirming: 'Casting your vote',
    submitted: 'Your vote was recorded.',
    queued: 'Your vote is saved on this device. It will be sent when the connection returns.',
    rejected: 'Your vote was rejected. {{reason}}',
    acknowledge: 'Acknowledge',
    acknowledgeHint: 'Removes the rejected vote from your list.',
    noVotingRightsAs: 'Your role in this meeting ({{role}}) does not carry a vote.',
    reason: {
      resolutionNotFound: 'This resolution no longer exists.',
      notAParticipant: 'You are not a participant of this meeting.',
      noVotingRights: 'Your role in this meeting does not carry a vote.',
      resolutionClosed: 'Voting is closed on this resolution.',
      votingWindowOver: 'The voting period for this resolution has ended.',
      alreadyVotedRecorded: 'You have already voted on this resolution. A vote is final.',
      alreadyVotedQueued:
        'You have already voted on this resolution. Your vote is waiting to be sent.',
      voteUndeliverable_one: 'Your vote could not be delivered after {{formattedCount}} attempt.',
      voteUndeliverable_many: 'Your vote could not be delivered after {{formattedCount}} attempts.',
      voteUndeliverable_other:
        'Your vote could not be delivered after {{formattedCount}} attempts.',
    },
    failure: {
      voteInProgress: 'A vote on this resolution is already being cast.',
      votePreviouslyRejected:
        'An earlier vote on this resolution was rejected. Acknowledge it before voting again.',
      voteNotRejected: 'This vote is still waiting to be sent, so it cannot be acknowledged.',
      storageWriteFailed:
        'Your vote could not be saved on this device. It has not been cast. Try again.',
    },
  },
  voteBiometric: {
    biometricCancelled: 'Confirmation was cancelled. Your vote has not been cast.',
    biometricFailed: 'You were not recognised. Your vote has not been cast. Try again.',
    biometricLockedOut:
      'Too many attempts. Your vote has not been cast. Wait a moment, or unlock your device with its passcode, then try again.',
    biometricUnavailable:
      'Biometric confirmation is not available on this device, and a vote needs it. Your vote has not been cast.',
    biometricNotEnrolled:
      'No fingerprint or face is registered on this device. Add one in the settings of the device to vote.',
  },
  pendingVotes: {
    open: 'Pending votes',
    openWithCount: 'Pending votes, {{number}}',
    loading: 'Loading pending votes',
    explanation:
      'Votes cast without a connection wait here and are sent as soon as you are back online. They are kept if you sign out.',
    waiting: 'Waiting to be sent',
    rejected: 'Rejected',
    empty: 'No vote is waiting to be sent.',
    castAt: 'Cast on {{date}}',
    rejectedAt: 'Rejected on {{date}}',
    openMeeting: 'Open the meeting',
    unreadable_one:
      '{{formattedCount}} saved vote on this device can no longer be read. It will not be sent. Check on the meeting whether your vote was recorded, then you can delete it.',
    unreadable_many:
      '{{formattedCount}} saved votes on this device can no longer be read. They will not be sent. Check on the meetings whether your votes were recorded, then you can delete them.',
    unreadable_other:
      '{{formattedCount}} saved votes on this device can no longer be read. They will not be sent. Check on the meetings whether your votes were recorded, then you can delete them.',
    discard: 'Delete what cannot be read',
    discardHint: 'Asks you to confirm.',
    discardTitle: 'Delete what cannot be read?',
    discardMessage_one:
      '{{formattedCount}} saved vote will be deleted from this device for good. This cannot be undone.',
    discardMessage_many:
      '{{formattedCount}} saved votes will be deleted from this device for good. This cannot be undone.',
    discardMessage_other:
      '{{formattedCount}} saved votes will be deleted from this device for good. This cannot be undone.',
    discarding: 'Deleting',
    discardFailed: 'They could not be deleted. Try again.',
  },
  banner: {
    offline:
      'You are offline. Votes you cast are saved on this device and sent when the connection returns.',
    sent_one: '{{formattedCount}} vote was sent.',
    sent_many: '{{formattedCount}} votes were sent.',
    sent_other: '{{formattedCount}} votes were sent.',
    rejected_one: '{{formattedCount}} vote was rejected. See your pending votes.',
    rejected_many: '{{formattedCount}} votes were rejected. See your pending votes.',
    rejected_other: '{{formattedCount}} votes were rejected. See your pending votes.',
    dismiss: 'Dismiss',
    localDataReset:
      'Some data saved on this device could not be read and was reset. Votes that were waiting to be sent from this device may have been lost: please check that your votes were recorded.',
  },
  demo: {
    badge: 'Demo',
    accounts: 'Demo accounts',
    accountsHint: 'Touch an account to fill in its email address and password.',
    useAccount: 'Use {{name}}',
    offline: 'Simulate being offline',
    offlineHint: 'Cuts the simulated server. Only the demo has this switch.',
  },
  privacy: {
    hidden: 'Content hidden to protect your privacy',
  },
} as const;
