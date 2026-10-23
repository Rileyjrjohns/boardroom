import { useLocalSearchParams } from 'expo-router';

import { ROUTE_PARAMS } from '@core/presentation/navigation/routes';
import { useOpenDocumentScreen } from '@features/documents/presentation/navigation/useOpenDocumentScreen';
import { MeetingDetailScreen } from '@features/meetings/presentation/screens/MeetingDetailScreen';

export default function MeetingDetailRoute() {
  const params = useLocalSearchParams<Record<typeof ROUTE_PARAMS.meetingId, string>>();
  const openDocument = useOpenDocumentScreen();
  return (
    <MeetingDetailScreen meetingId={params[ROUTE_PARAMS.meetingId]} onOpenDocument={openDocument} />
  );
}
