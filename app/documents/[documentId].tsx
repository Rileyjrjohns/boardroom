import { useLocalSearchParams } from 'expo-router';

import { ROUTE_PARAMS } from '@core/presentation/navigation/routes';
import { DocumentScreen } from '@features/documents/presentation/screens/DocumentScreen';

export default function DocumentRoute() {
  const params = useLocalSearchParams<Record<typeof ROUTE_PARAMS.documentId, string>>();
  return <DocumentScreen documentId={params[ROUTE_PARAMS.documentId]} />;
}
