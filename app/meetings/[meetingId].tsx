import { useLocalSearchParams } from 'expo-router';

import { useOpenDocumentScreen } from '@presentation/navigation/useOpenDocumentScreen';
import { ROUTE_PARAMS } from '@presentation/navigation/routes';
import { MeetingDetailScreen } from '@presentation/screens/MeetingDetailScreen';

export default function MeetingDetailRoute() {
  const params = useLocalSearchParams<Record<typeof ROUTE_PARAMS.meetingId, string>>();
  const openDocument = useOpenDocumentScreen();
  return (
    <MeetingDetailScreen meetingId={params[ROUTE_PARAMS.meetingId]} onOpenDocument={openDocument} />
  );
}
