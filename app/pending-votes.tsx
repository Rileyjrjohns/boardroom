import { useOpenMeeting } from '@features/meetings/presentation/navigation/useOpenMeeting';
import { PendingVotesScreen } from '@features/votes/presentation/screens/PendingVotesScreen';

export default function PendingVotesRoute() {
  const openMeeting = useOpenMeeting();
  return <PendingVotesScreen onOpenMeeting={openMeeting} />;
}
