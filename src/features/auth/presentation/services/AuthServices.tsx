import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { EvaluateAppLock } from '@features/auth/application/use-cases/EvaluateAppLock';
import type { GetCurrentUser } from '@features/auth/application/use-cases/GetCurrentUser';
import type { RestoreSession } from '@features/auth/application/use-cases/RestoreSession';
import type { SignIn } from '@features/auth/application/use-cases/SignIn';
import type { SignOut } from '@features/auth/application/use-cases/SignOut';
import type { UnlockApp } from '@features/auth/application/use-cases/UnlockApp';

/**
 * The use cases the screens and the hooks of the session need. The presentation of the feature
 * declares the shape it depends on, and whatever builds the use cases (the composition root, a
 * test) provides it: the feature never imports the composition. Only the `execute` of a use case is
 * part of the shape, so a stand-in needs no more than that.
 */
export interface AuthServices {
  readonly restoreSession: Pick<RestoreSession, 'execute'>;
  readonly signIn: Pick<SignIn, 'execute'>;
  readonly signOut: Pick<SignOut, 'execute'>;
  readonly evaluateAppLock: Pick<EvaluateAppLock, 'execute'>;
  readonly unlockApp: Pick<UnlockApp, 'execute'>;
  readonly getCurrentUser: Pick<GetCurrentUser, 'execute'>;
}

const AuthServicesContext = createContext<AuthServices | undefined>(undefined);

interface AuthServicesProviderProps {
  readonly services: AuthServices;
  readonly children: ReactNode;
}

/** Exposes the use cases of the session to the hooks of the feature, through React context. */
export function AuthServicesProvider({ services, children }: AuthServicesProviderProps) {
  return <AuthServicesContext.Provider value={services}>{children}</AuthServicesContext.Provider>;
}

/**
 * The use cases of the session. A component outside the provider is a programming error, hence the
 * throw: there is nothing sensible to render without them.
 */
export function useAuthServices(): AuthServices {
  const services = useContext(AuthServicesContext);
  if (services === undefined) {
    throw new Error('useAuthServices must be used inside an AuthServicesProvider.');
  }
  return services;
}
