import type { TranslationResource } from './translation';

/**
 * French resource, typed against the English one: a missing or an extra key fails the typecheck.
 *
 * French has three plural categories. `one` covers 0 and 1, so "0 page" is correct. `many`
 * applies to exact multiples of one million and takes a "de": "1000000 de pages". Everything
 * else is `other`.
 *
 * A colon is preceded by a no-break space (U+00A0), as French typography wants.
 */
export const fr: TranslationResource = {
  app: {
    name: 'Boardroom',
  },
  common: {
    cancel: 'Annuler',
    close: 'Fermer',
  },
  navigation: {
    meetings: 'Réunions',
    meeting: 'Réunion',
    document: 'Document',
    signIn: 'Connexion',
    locked: 'Verrouillé',
    pendingVotes: 'Votes en attente',
  },
  meetings: {
    period: {
      label: 'Période des réunions',
      upcoming: 'À venir',
      past: 'Passées',
    },
    empty: {
      upcoming: 'Aucune réunion à venir.',
      past: 'Aucune réunion passée.',
    },
    loading: 'Chargement des réunions',
    loadingMore: 'Chargement des réunions suivantes',
    endOfList: 'Toutes les réunions sont affichées.',
    openHint: 'Ouvre la réunion',
  },
  meeting: {
    loading: 'Chargement de la réunion',
    agenda: 'Ordre du jour',
    agendaEmpty: 'Il n’y a pas d’ordre du jour.',
    agendaItem: '{{position}}. {{title}}',
    documents: 'Documents',
    documentsEmpty: 'Il n’y a aucun document.',
    participants: 'Participants',
    participantsEmpty: 'Il n’y a aucun participant.',
    votingDeadline: 'Vote possible jusqu’au {{date}}',
    votingClosedOn: 'Clôturée le {{date}}',
    resolutionYourVote: 'Votre vote\u00a0: {{choice}}',
    resolutionYourVoteQueued: 'Votre vote\u00a0: {{choice}} (en attente d’envoi)',
    resolutionNoVote: 'Vous n’avez pas voté.',
    pageCount_one: '{{formattedCount}} page',
    pageCount_many: '{{formattedCount}} de pages',
    pageCount_other: '{{formattedCount}} pages',
    documentLabel: '{{title}}, {{confidentiality}}, {{pages}}',
    openDocumentHint: 'Ouvre le document',
  },
  document: {
    loading: 'Ouverture du document',
    rendering: 'Affichage du document',
    protectedBadge: 'Écran protégé',
    pageIndicator: 'Page {{page}} sur {{total}}',
    notFound: 'Ce document n’existe pas, ou vous n’y avez plus accès.',
    renderFailed: 'Le document n’a pas pu être affiché. Réessayez.',
    capture: {
      screenshot: 'Une capture d’écran a été détectée. Elle a été consignée.',
      recording: 'Un enregistrement de l’écran a été détecté. Il a été consigné.',
    },
    errors: {
      networkUnavailable:
        'Ce document n’est pas enregistré sur cet appareil, il n’est donc pas disponible hors ligne. Vérifiez votre connexion puis réessayez.',
      forbidden: 'Vous n’avez pas accès à ce document.',
      screenProtectionUnsupported:
        'Ce document est confidentiel et l’écran de cet appareil ne peut pas être protégé, il n’est donc pas affiché.',
      screenProtectionFailed:
        'L’écran n’a pas pu être protégé, le document n’est donc pas affiché. Réessayez.',
    },
  },
  states: {
    retry: 'Réessayer',
    staleData: 'Affichage des données enregistrées le {{date}}',
    refreshing: 'Actualisation en cours',
  },
  participantRole: {
    chair: 'Présidence',
    secretary: 'Secrétariat',
    member: 'Membre',
    guest: 'Personne invitée',
  },
  votingState: {
    open: 'Ouverte',
    closed: 'Clôturée',
    windowOver: 'Délai écoulé',
  },
  confidentiality: {
    public: 'Public',
    internal: 'Interne',
    confidential: 'Confidentiel',
  },
  voteChoice: {
    for: 'Pour',
    against: 'Contre',
    abstain: 'Abstention',
  },
  errors: {
    networkUnavailable: 'Le serveur est injoignable. Vérifiez votre connexion et réessayez.',
    unauthorized: 'Votre session n’est plus valide. Reconnectez-vous.',
    forbidden: 'Vous n’avez pas accès à cette réunion.',
    notAuthenticated: 'Aucune session n’est ouverte. Connectez-vous pour continuer.',
    sessionExpired: 'Votre session a expiré. Reconnectez-vous.',
    appLocked: 'L’application est verrouillée. Déverrouillez-la pour continuer.',
    sessionChanged: 'Le compte en cours a changé. Reconnectez-vous.',
    notFound: 'Cette réunion n’existe pas, ou vous n’y avez plus accès.',
    invalidCredentials: 'L’adresse e-mail ou le mot de passe est incorrect.',
    storageWriteFailed: 'Les données n’ont pas pu être enregistrées sur cet appareil. Réessayez.',
    unexpected: 'Une erreur est survenue de notre côté. Réessayez dans un instant.',
    storageReadFailed: 'Les données enregistrées sur cet appareil n’ont pas pu être lues.',
    validation: 'La requête n’était pas valide.',
  },
  startup: {
    loading: 'Démarrage de Boardroom',
    title: 'Boardroom ne peut pas démarrer',
    message:
      'L’application n’est pas configurée correctement, ou les données enregistrées sur cet appareil ne peuvent pas être ouvertes. Vérifiez le réglage EXPO_PUBLIC_BOARDROOM_ADAPTERS, qui accepte mock ou http, et pour http le réglage EXPO_PUBLIC_BOARDROOM_API_BASE_URL\u00a0: une adresse https, ou http pour cet ordinateur seulement. Une version de développement utilise mock quand le premier manque\u00a0; toute autre version l’exige.',
    code: 'Code technique\u00a0: {{code}}',
    forgetExplanation:
      'Si réessayer ne suffit pas, vous pouvez fermer la session sur cet appareil, puis vous reconnecter. Les votes en attente d’envoi restent sur cet appareil.',
    forget: 'Fermer la session sur cet appareil',
  },
  biometric: {
    unlockApp: 'Déverrouiller Boardroom',
    confirmVote: 'Confirmer votre vote',
  },
  signIn: {
    title: 'Connexion à Boardroom',
    message: 'Utilisez le compte de votre organisation pour consulter vos réunions et voter.',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    submit: 'Se connecter',
    submitting: 'Connexion en cours',
    emailRequired: 'Saisissez votre adresse e-mail.',
    emailInvalid: 'Saisissez une adresse e-mail valide, par exemple nom@societe.com.',
    emailTooLong: 'Cette adresse e-mail est trop longue.',
    passwordRequired: 'Saisissez votre mot de passe.',
  },
  lock: {
    title: 'Boardroom est verrouillé',
    message:
      'Boardroom se verrouille à son démarrage et après un moment d’absence. Déverrouillez-le pour consulter vos réunions.',
    unlock: 'Déverrouiller',
    unlockHint: 'Ouvre la demande d’empreinte ou de visage de votre appareil.',
    unlocking: 'Déverrouillage en cours',
  },
  unlockErrors: {
    biometricUnavailable:
      'Le déverrouillage biométrique n’est pas disponible sur cet appareil. Déconnectez-vous puis reconnectez-vous pour continuer.',
    biometricNotEnrolled:
      'Aucune empreinte ni aucun visage n’est enregistré sur cet appareil. Ajoutez-en un dans les réglages de l’appareil, ou déconnectez-vous puis reconnectez-vous.',
    biometricCancelled: 'Le déverrouillage a été annulé. Réessayez quand vous le souhaitez.',
    biometricFailed: 'La reconnaissance a échoué. Réessayez.',
    biometricLockedOut:
      'Trop de tentatives. Patientez un instant, ou déverrouillez votre appareil avec son code, puis réessayez.',
  },
  signOut: {
    action: 'Se déconnecter',
    hint: 'Demande une confirmation.',
    title: 'Se déconnecter de Boardroom\u00a0?',
    message: 'Vous devrez vous reconnecter pour consulter vos réunions.',
    pending_one:
      '{{formattedCount}} vote est en attente d’envoi. Il est conservé sur cet appareil et sera envoyé après votre prochaine connexion.',
    pending_many:
      '{{formattedCount}} de votes sont en attente d’envoi. Ils sont conservés sur cet appareil et seront envoyés après votre prochaine connexion.',
    pending_other:
      '{{formattedCount}} votes sont en attente d’envoi. Ils sont conservés sur cet appareil et seront envoyés après votre prochaine connexion.',
    pendingUnknown:
      'Tout vote en attente d’envoi est conservé sur cet appareil et sera envoyé après votre prochaine connexion.',
    signingOut: 'Déconnexion en cours',
    failed: 'La déconnexion a échoué. Réessayez.',
  },
  voting: {
    loading: 'Vérification de votre droit de vote',
    choose: 'Votre vote',
    choiceHint: 'Ouvre une étape de confirmation avant l’enregistrement de votre vote.',
    confirmTitle: 'Confirmez votre vote',
    confirmChoice: 'Votre choix\u00a0: {{choice}}',
    confirmFinal:
      'Votre vote est définitif. Une fois exprimé, il ne peut être ni modifié ni retiré.',
    confirmBiometric:
      'Votre appareil vous demandera votre empreinte ou votre visage pour le confirmer.',
    confirmOffline:
      'Vous êtes hors ligne. Votre vote sera enregistré sur cet appareil et envoyé au retour de la connexion.',
    confirm: 'Confirmer mon vote',
    confirming: 'Enregistrement de votre vote',
    submitted: 'Votre vote a été enregistré.',
    queued: 'Votre vote est enregistré sur cet appareil. Il sera envoyé au retour de la connexion.',
    rejected: 'Votre vote a été refusé. {{reason}}',
    acknowledge: 'Prendre connaissance',
    acknowledgeHint: 'Retire le vote refusé de votre liste.',
    noVotingRightsAs: 'Votre rôle dans cette réunion ({{role}}) ne comporte pas de droit de vote.',
    reason: {
      resolutionNotFound: 'Cette résolution n’existe plus.',
      notAParticipant: 'Vous ne participez pas à cette réunion.',
      noVotingRights: 'Votre rôle dans cette réunion ne comporte pas de droit de vote.',
      resolutionClosed: 'Le vote est clos sur cette résolution.',
      votingWindowOver: 'La période de vote de cette résolution est terminée.',
      alreadyVotedRecorded: 'Vous avez déjà voté sur cette résolution. Un vote est définitif.',
      alreadyVotedQueued:
        'Vous avez déjà voté sur cette résolution. Votre vote est en attente d’envoi.',
      voteUndeliverable_one:
        'Votre vote n’a pas pu être transmis après {{formattedCount}} tentative.',
      voteUndeliverable_many:
        'Votre vote n’a pas pu être transmis après {{formattedCount}} de tentatives.',
      voteUndeliverable_other:
        'Votre vote n’a pas pu être transmis après {{formattedCount}} tentatives.',
    },
    failure: {
      voteInProgress: 'Un vote sur cette résolution est déjà en cours d’enregistrement.',
      votePreviouslyRejected:
        'Un vote précédent sur cette résolution a été refusé. Prenez-en connaissance avant de voter à nouveau.',
      voteNotRejected: 'Ce vote est encore en attente d’envoi, il ne peut donc pas être retiré.',
      storageWriteFailed:
        'Votre vote n’a pas pu être enregistré sur cet appareil. Il n’a pas été exprimé. Réessayez.',
    },
  },
  voteBiometric: {
    biometricCancelled: 'La confirmation a été annulée. Votre vote n’a pas été exprimé.',
    biometricFailed: 'La reconnaissance a échoué. Votre vote n’a pas été exprimé. Réessayez.',
    biometricLockedOut:
      'Trop de tentatives. Votre vote n’a pas été exprimé. Patientez un instant, ou déverrouillez votre appareil avec son code, puis réessayez.',
    biometricUnavailable:
      'La confirmation biométrique n’est pas disponible sur cet appareil, et un vote l’exige. Votre vote n’a pas été exprimé.',
    biometricNotEnrolled:
      'Aucune empreinte ni aucun visage n’est enregistré sur cet appareil. Ajoutez-en un dans les réglages de l’appareil pour voter.',
  },
  pendingVotes: {
    open: 'Votes en attente',
    openWithCount: 'Votes en attente, {{number}}',
    loading: 'Chargement des votes en attente',
    explanation:
      'Les votes exprimés sans connexion attendent ici et sont envoyés dès que vous êtes de nouveau en ligne. Ils sont conservés si vous vous déconnectez.',
    waiting: 'En attente d’envoi',
    rejected: 'Refusés',
    empty: 'Aucun vote n’est en attente d’envoi.',
    castAt: 'Exprimé le {{date}}',
    rejectedAt: 'Refusé le {{date}}',
    openMeeting: 'Ouvrir la réunion',
    unreadable_one:
      '{{formattedCount}} vote enregistré sur cet appareil est devenu illisible. Il ne sera pas envoyé. Vérifiez dans la réunion que votre vote a bien été enregistré, puis vous pourrez le supprimer.',
    unreadable_many:
      '{{formattedCount}} de votes enregistrés sur cet appareil sont devenus illisibles. Ils ne seront pas envoyés. Vérifiez dans les réunions que vos votes ont bien été enregistrés, puis vous pourrez les supprimer.',
    unreadable_other:
      '{{formattedCount}} votes enregistrés sur cet appareil sont devenus illisibles. Ils ne seront pas envoyés. Vérifiez dans les réunions que vos votes ont bien été enregistrés, puis vous pourrez les supprimer.',
    discard: 'Supprimer ce qui est illisible',
    discardHint: 'Vous demande de confirmer.',
    discardTitle: 'Supprimer ce qui est illisible\u00a0?',
    discardMessage_one:
      '{{formattedCount}} vote enregistré va être supprimé définitivement de cet appareil. Cette action est irréversible.',
    discardMessage_many:
      '{{formattedCount}} de votes enregistrés vont être supprimés définitivement de cet appareil. Cette action est irréversible.',
    discardMessage_other:
      '{{formattedCount}} votes enregistrés vont être supprimés définitivement de cet appareil. Cette action est irréversible.',
    discarding: 'Suppression en cours',
    discardFailed: 'Ils n’ont pas pu être supprimés. Réessayez.',
  },
  banner: {
    offline:
      'Vous êtes hors ligne. Les votes que vous exprimez sont enregistrés sur cet appareil et envoyés au retour de la connexion.',
    sent_one: '{{formattedCount}} vote a été envoyé.',
    sent_many: '{{formattedCount}} de votes ont été envoyés.',
    sent_other: '{{formattedCount}} votes ont été envoyés.',
    rejected_one: '{{formattedCount}} vote a été refusé. Consultez vos votes en attente.',
    rejected_many: '{{formattedCount}} de votes ont été refusés. Consultez vos votes en attente.',
    rejected_other: '{{formattedCount}} votes ont été refusés. Consultez vos votes en attente.',
    dismiss: 'Masquer',
    localDataReset:
      'Des données enregistrées sur cet appareil étaient illisibles et ont été réinitialisées. Des votes en attente d’envoi depuis cet appareil ont peut-être été perdus\u00a0: vérifiez que vos votes ont bien été enregistrés.',
  },
  demo: {
    badge: 'Démo',
    accounts: 'Comptes de démonstration',
    accountsHint: 'Touchez un compte pour renseigner son adresse e-mail et son mot de passe.',
    useAccount: 'Utiliser {{name}}',
    offline: 'Simuler une perte de connexion',
    offlineHint: 'Coupe le serveur simulé. Seule la démonstration dispose de ce réglage.',
  },
  privacy: {
    hidden: 'Contenu masqué pour protéger votre confidentialité',
  },
};
