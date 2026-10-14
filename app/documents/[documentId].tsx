import { useLocalSearchParams } from 'expo-router';

import { ROUTE_PARAMS } from '@presentation/navigation/routes';
import { DocumentScreen } from '@presentation/screens/DocumentScreen';

export default function DocumentRoute() {
  const params = useLocalSearchParams<Record<typeof ROUTE_PARAMS.documentId, string>>();
  return <DocumentScreen documentId={params[ROUTE_PARAMS.documentId]} />;
}
