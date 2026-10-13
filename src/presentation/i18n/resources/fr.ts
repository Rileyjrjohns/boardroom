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
    endOfList: 'Vous avez vu toutes les réunions.',
    loadMoreFailed: 'Les réunions suivantes n’ont pas pu être chargées.',
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
    resolutionClosesAt: 'Fin du vote le {{date}}',
    resolutionYourVote: 'Votre vote : {{choice}}',
    resolutionNoVote: 'Vous n’avez pas voté.',
    pageCount_one: '{{count}} page',
    pageCount_many: '{{count}} de pages',
    pageCount_other: '{{count}} pages',
  },
  states: {
    retry: 'Réessayer',
    staleData: 'Données enregistrées le {{date}}',
  },
  participantRole: {
    chair: 'Président',
    secretary: 'Secrétaire',
    member: 'Membre',
    guest: 'Invité',
  },
  resolutionStatus: {
    open: 'Ouverte',
    closed: 'Clôturée',
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
    unauthorized: 'Vous n’avez pas accès à cet élément. Reconnectez-vous.',
    notAuthenticated: 'Vous êtes déconnecté. Connectez-vous pour continuer.',
    sessionExpired: 'Votre session a expiré. Reconnectez-vous.',
    notFound: 'Cette réunion n’existe pas, ou vous n’y avez plus accès.',
    unexpected: 'Une erreur est survenue de notre côté. Réessayez dans un instant.',
    storageReadFailed: 'Les données enregistrées sur cet appareil n’ont pas pu être lues.',
    validation: 'La requête n’était pas valide.',
  },
  startup: {
    title: 'Boardroom ne peut pas démarrer',
    message:
      'L’application n’est pas configurée correctement. Vérifiez le réglage EXPO_PUBLIC_BOARDROOM_ADAPTERS : il accepte mock (la valeur par défaut) ou http, qui n’est pas encore disponible.',
    code: 'Code technique : {{code}}',
  },
};
