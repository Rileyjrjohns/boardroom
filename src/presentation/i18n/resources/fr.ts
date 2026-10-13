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
  navigation: {
    meetings: 'Réunions',
    meeting: 'Réunion',
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
    resolutionYourVote: 'Votre vote : {{choice}}',
    resolutionNoVote: 'Vous n’avez pas voté.',
    pageCount_one: '{{formattedCount}} page',
    pageCount_many: '{{formattedCount}} de pages',
    pageCount_other: '{{formattedCount}} pages',
  },
  states: {
    retry: 'Réessayer',
    staleData: 'Affichage des données enregistrées le {{date}}',
    refreshing: 'Actualisation en cours',
  },
  participantRole: {
    chair: 'Président',
    secretary: 'Secrétaire',
    member: 'Membre',
    guest: 'Invité',
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
    notAuthenticated: 'Vous êtes déconnecté. Connectez-vous pour continuer.',
    sessionExpired: 'Votre session a expiré. Reconnectez-vous.',
    appLocked: 'L’application est verrouillée. Déverrouillez-la pour continuer.',
    sessionChanged: 'L’utilisateur connecté a changé. Reconnectez-vous.',
    notFound: 'Cette réunion n’existe pas, ou vous n’y avez plus accès.',
    unexpected: 'Une erreur est survenue de notre côté. Réessayez dans un instant.',
    storageReadFailed: 'Les données enregistrées sur cet appareil n’ont pas pu être lues.',
    validation: 'La requête n’était pas valide.',
  },
  startup: {
    title: 'Boardroom ne peut pas démarrer',
    message:
      'L’application n’est pas configurée correctement. Vérifiez le réglage EXPO_PUBLIC_BOARDROOM_ADAPTERS\u00a0: il accepte mock ou http, qui n’est pas encore disponible. Une version de développement utilise mock quand le réglage manque\u00a0; toute autre version l’exige.',
    code: 'Code technique : {{code}}',
  },
};
