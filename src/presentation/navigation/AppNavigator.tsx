import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ROUTE_NAMES } from './routes';

/**
 * The navigation stack of the app, with the titles of its screens in the language of the user. It
 * is a component of the layer, and not written in the route file, because the titles are
 * translated and the route files stay free of everything but wiring.
 */
export function AppNavigator() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name={ROUTE_NAMES.meetings} options={{ title: t('navigation.meetings') }} />
      <Stack.Screen name={ROUTE_NAMES.meetingDetail} options={{ title: t('navigation.meeting') }} />
    </Stack>
  );
}
