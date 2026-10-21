import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions } from '../components/HeaderActions';
import { ACCESS, useUiStore } from '../state/uiStore';

import { ROUTE_NAMES, ROUTE_PARAMS } from './routes';
import { SCREEN_TITLE_KEYS } from './screenTitles';

/**
 * The identity of a meeting screen in the stack: the meeting it shows. Opening a meeting that is
 * already open (a second tap on a row before the screen has come up, a link opened twice) goes to
 * that screen instead of stacking another one on top of it. (`getId` is the same thing under its
 * former name, which expo-router deprecates.)
 */
function meetingScreenId(_name: string, params: Record<string, unknown>): string | undefined {
  const value = params[ROUTE_PARAMS.meetingId];
  return typeof value === 'string' ? value : undefined;
}

/**
 * The identity of a document screen in the stack: the document it shows. A second tap on a row
 * before the screen has come up goes to the screen that is open: two screens would count two views
 * of the document, and only the one on top would be left on the screen.
 */
function documentScreenId(_name: string, params: Record<string, unknown>): string | undefined {
  const value = params[ROUTE_PARAMS.documentId];
  return typeof value === 'string' ? value : undefined;
}

/** The header of the list. A function of the module, not of the component, so that it is stable. */
function renderListHeaderActions() {
  return <HeaderActions />;
}

/**
 * The navigation stack of the app, with the titles of its screens in the language of the user. It
 * is a component of the layer, and not written in the route file, because the titles are
 * translated and the route files stay free of everything but wiring.
 *
 * **Which routes exist depends on where the user stands**, with the protected screens of expo-router
 * (`Stack.Protected`): the sign-in screen exists for a signed-out user only, the lock screen for a
 * locked app only, and the meetings, their details, the documents and the pending votes for an open
 * app only. A
 * screen whose guard is false is not in the stack at all, and that gives the two guarantees the
 * app depends on:
 *
 * - **no deep link reaches a protected screen.** A link to a meeting, opened while the user is
 *   signed out or the app is locked, finds no such route and the stack starts on the screen that
 *   exists (sign-in or lock). Once the user is allowed in, they land on the list: the link is not
 *   kept, because remembering where a link wanted to go would send whoever signs in next (another
 *   user, say) to a meeting they may not have, and the state of the stack is not the state of the
 *   session to keep (the choice is documented in "Session, lock and navigation" of
 *   docs/design-in-depth.md);
 * - **the back stack never returns to a protected screen.** When the guard turns false (a sign-out,
 *   a lock) the screens are removed from the stack, history included, so there is nothing to go
 *   back to, and when it turns true again the stack starts anew on the first screen.
 */
export function AppNavigator() {
  const { t } = useTranslation();
  const access = useUiStore((state) => state.access);

  return (
    <Stack>
      <Stack.Protected guard={access === ACCESS.SignedOut}>
        <Stack.Screen
          name={ROUTE_NAMES.signIn}
          options={{ title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.signIn]) }}
        />
      </Stack.Protected>
      <Stack.Protected guard={access === ACCESS.Locked}>
        <Stack.Screen
          name={ROUTE_NAMES.lock}
          options={{ title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.lock]) }}
        />
      </Stack.Protected>
      <Stack.Protected guard={access === ACCESS.Unlocked}>
        <Stack.Screen
          name={ROUTE_NAMES.meetings}
          options={{
            title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.meetings]),
            headerRight: renderListHeaderActions,
          }}
        />
        <Stack.Screen
          name={ROUTE_NAMES.meetingDetail}
          options={{ title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.meetingDetail]) }}
          dangerouslySingular={meetingScreenId}
        />
        <Stack.Screen
          name={ROUTE_NAMES.document}
          options={{ title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.document]) }}
          dangerouslySingular={documentScreenId}
        />
        <Stack.Screen
          name={ROUTE_NAMES.pendingVotes}
          options={{ title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.pendingVotes]) }}
        />
      </Stack.Protected>
    </Stack>
  );
}
