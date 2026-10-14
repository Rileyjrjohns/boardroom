import screenProtectionModule from '../../../modules/screen-protection';

import type { ScreenProtectionModuleApi } from './ScreenProtectionModuleApi';

/**
 * The native module ScreenProtection, or `undefined` when the build has none (a development client
 * made before the module existed, or a platform it does not support). This is the one place that
 * imports it, with its type: assigning it to the seam of the adapter is what keeps the names of
 * its events and functions in step with the adapter. The adapter treats a missing module as a
 * platform that cannot protect the screen. In Jest this import is an empty module (see
 * `jest.config.js`), so the result there is `undefined`.
 */
export function loadScreenProtectionModule(): ScreenProtectionModuleApi | undefined {
  const loaded: ScreenProtectionModuleApi | null | undefined = screenProtectionModule;
  return loaded ?? undefined;
}
