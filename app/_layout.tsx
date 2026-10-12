import { Stack } from 'expo-router';

import { I18nProvider } from '@presentation/i18n/I18nProvider';

// Root layout. It mounts the providers exposed by the presentation layer, and is where the
// composition root exposed by `@di` will be handed to them once it exists. The `app/` folder
// itself stays free of business logic.
export default function RootLayout() {
  return (
    <I18nProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </I18nProvider>
  );
}
