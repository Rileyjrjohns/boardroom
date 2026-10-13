import { useOpenMeeting } from '@presentation/navigation/useOpenMeeting';
import { MeetingsListScreen } from '@presentation/screens/MeetingsListScreen';

export default function IndexRoute() {
  const openMeeting = useOpenMeeting();
  return <MeetingsListScreen onOpenMeeting={openMeeting} />;
}
