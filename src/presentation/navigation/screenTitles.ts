import type { ValueOf } from '@domain/shared/constants';

import type { TranslationKey } from '../i18n/translationKeys';

import { ROUTE_NAMES } from './routes';

/** The route of a screen of the stack. */
export type RouteName = ValueOf<typeof ROUTE_NAMES>;

/**
 * The title in the header of each screen, as a translation key. Typed over every route of the
 * stack, so a route added without a title fails the typecheck.
 */
export const SCREEN_TITLE_KEYS = {
  [ROUTE_NAMES.meetings]: 'navigation.meetings',
  [ROUTE_NAMES.meetingDetail]: 'navigation.meeting',
  [ROUTE_NAMES.document]: 'navigation.document',
  [ROUTE_NAMES.pendingVotes]: 'navigation.pendingVotes',
  [ROUTE_NAMES.signIn]: 'navigation.signIn',
  [ROUTE_NAMES.lock]: 'navigation.locked',
} as const satisfies Record<RouteName, TranslationKey>;
