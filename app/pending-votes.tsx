import { useOpenMeeting } from '@presentation/navigation/useOpenMeeting';
import { PendingVotesScreen } from '@presentation/screens/PendingVotesScreen';

export default function PendingVotesRoute() {
  const openMeeting = useOpenMeeting();
  return <PendingVotesScreen onOpenMeeting={openMeeting} />;
}
