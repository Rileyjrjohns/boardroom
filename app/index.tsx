import { useOpenMeeting } from '@features/meetings/presentation/navigation/useOpenMeeting';
import { MeetingsListScreen } from '@features/meetings/presentation/screens/MeetingsListScreen';

export default function IndexRoute() {
  const openMeeting = useOpenMeeting();
  return <MeetingsListScreen onOpenMeeting={openMeeting} />;
}
