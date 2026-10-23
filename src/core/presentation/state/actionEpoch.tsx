import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * Reads the epoch of the access the app is in: a number that goes up every time the user moves from
 * one state of access to another (signed out, locked, open). An action that starts under one epoch
 * hands it back with its result, so that the answer of an action started by a user who has left is
 * not applied to the one who came after (see `useResultMutation` and `QueryFailure`).
 *
 * Where the user stands is the business of `auth`, so the core does not read it: it declares what
 * it needs, and the composition provides it (see `AppProviders`).
 */
export type ReadActionEpoch = () => number;

/** Without a provider there is a single epoch: nothing moves the user. */
const SINGLE_EPOCH: ReadActionEpoch = () => 0;

const ActionEpochContext = createContext<ReadActionEpoch>(SINGLE_EPOCH);

interface ActionEpochProviderProps {
  readonly read: ReadActionEpoch;
  readonly children: ReactNode;
}

export function ActionEpochProvider({ read, children }: ActionEpochProviderProps) {
  return <ActionEpochContext.Provider value={read}>{children}</ActionEpochContext.Provider>;
}

/** The function that reads the epoch of the access, at the moment an action starts. */
export function useActionEpoch(): ReadActionEpoch {
  return useContext(ActionEpochContext);
}
