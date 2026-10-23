import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { AcknowledgeRejectedVote } from '@features/votes/application/use-cases/AcknowledgeRejectedVote';
import type { CastVote } from '@features/votes/application/use-cases/CastVote';
import type { DiscardUnreadableVotes } from '@features/votes/application/use-cases/DiscardUnreadableVotes';
import type { ListPendingVotes } from '@features/votes/application/use-cases/ListPendingVotes';
import type { SyncPendingVotes } from '@features/votes/application/use-cases/SyncPendingVotes';

/**
 * The use cases the screens and the hooks of the votes need. The presentation of the feature
 * declares the shape it depends on, and whatever builds the use cases (the composition root, a
 * test) provides it: the feature never imports the composition. Only the `execute` of a use case is
 * part of the shape, so a stand-in needs no more than that.
 */
export interface VotesServices {
  readonly castVote: Pick<CastVote, 'execute'>;
  readonly syncPendingVotes: Pick<SyncPendingVotes, 'execute'>;
  readonly listPendingVotes: Pick<ListPendingVotes, 'execute'>;
  readonly acknowledgeRejectedVote: Pick<AcknowledgeRejectedVote, 'execute'>;
  readonly discardUnreadableVotes: Pick<DiscardUnreadableVotes, 'execute'>;
}

const VotesServicesContext = createContext<VotesServices | undefined>(undefined);

interface VotesServicesProviderProps {
  readonly services: VotesServices;
  readonly children: ReactNode;
}

/** Exposes the use cases of the votes to the hooks of the feature, through React context. */
export function VotesServicesProvider({ services, children }: VotesServicesProviderProps) {
  return <VotesServicesContext.Provider value={services}>{children}</VotesServicesContext.Provider>;
}

/**
 * The use cases of the votes. A component outside the provider is a programming error, hence the
 * throw: there is nothing sensible to render without them.
 */
export function useVotesServices(): VotesServices {
  const services = useContext(VotesServicesContext);
  if (services === undefined) {
    throw new Error('useVotesServices must be used inside a VotesServicesProvider.');
  }
  return services;
}
