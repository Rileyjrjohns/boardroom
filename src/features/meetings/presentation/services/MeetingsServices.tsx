import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { GetMeeting } from '@features/meetings/application/use-cases/GetMeeting';
import type { ListMeetings } from '@features/meetings/application/use-cases/ListMeetings';

/**
 * What the screens and the hooks of the meetings take from the outside: the use cases they call,
 * and the values of the configuration they depend on. The presentation of the feature declares the
 * shape, and whatever builds the use cases (the composition root, a test) provides it: the feature
 * never imports the composition. Only the `execute` of a use case is part of the shape, so a
 * stand-in needs no more than that.
 */
export interface MeetingsServices {
  readonly listMeetings: Pick<ListMeetings, 'execute'>;
  readonly getMeeting: Pick<GetMeeting, 'execute'>;
  /** How many meetings a page of the list holds. */
  readonly pageSize: number;
}

const MeetingsServicesContext = createContext<MeetingsServices | undefined>(undefined);

interface MeetingsServicesProviderProps {
  readonly services: MeetingsServices;
  readonly children: ReactNode;
}

/** Exposes the use cases of the meetings to the hooks of the feature, through React context. */
export function MeetingsServicesProvider({ services, children }: MeetingsServicesProviderProps) {
  return (
    <MeetingsServicesContext.Provider value={services}>{children}</MeetingsServicesContext.Provider>
  );
}

/**
 * The use cases and the settings of the meetings. A component outside the provider is a programming
 * error, hence the throw: there is nothing sensible to render without them.
 */
export function useMeetingsServices(): MeetingsServices {
  const services = useContext(MeetingsServicesContext);
  if (services === undefined) {
    throw new Error('useMeetingsServices must be used inside a MeetingsServicesProvider.');
  }
  return services;
}
