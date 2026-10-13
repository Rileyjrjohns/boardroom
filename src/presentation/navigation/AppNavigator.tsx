import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

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
 * The navigation stack of the app, with the titles of its screens in the language of the user. It
 * is a component of the layer, and not written in the route file, because the titles are
 * translated and the route files stay free of everything but wiring.
 */
export function AppNavigator() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen
        name={ROUTE_NAMES.meetings}
        options={{ title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.meetings]) }}
      />
      <Stack.Screen
        name={ROUTE_NAMES.meetingDetail}
        options={{ title: t(SCREEN_TITLE_KEYS[ROUTE_NAMES.meetingDetail]) }}
        dangerouslySingular={meetingScreenId}
      />
    </Stack>
  );
}
