# meetings

The meetings of the board: the list by period, and the detail with its agenda, resolutions, participants and documents.

| Layer             | What                                                                                                                                                                                                                                                                  | May import                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `domain/`         | `entities/` (`Meeting`, `MeetingSummary`, `AgendaItem`, `Resolution`, `Participant`, `Document`), `value-objects/` (`MeetingPeriod`, `VoteChoice`), `policies/votingState.ts`                                                                                         | `core/domain`, `auth/domain`, its own files, no package |
| `application/`    | `ports/` (`MeetingRepository`, `MeetingCache`), `loadMeeting.ts` (the meeting through the offline policy), `use-cases/` (`ListMeetings`, `GetMeeting`)                                                                                                                | `domain`, `core`, `auth`, its own files, no package     |
| `infrastructure/` | `HttpMeetingRepository` and its wire classes (`dto/meetingDto.ts`), `persistence/` (`SqliteMeetingCache` and the stored form of a meeting, `storedMeeting.ts`), `InMemoryMeetingCache`                                                                                | `domain`, `application`, `core`, the packages it adapts |
| `presentation/`   | `screens/` (`MeetingsListScreen`, `MeetingDetailScreen`), `components/` (`MeetingRow`, `AgendaItemView`, `ResolutionView`, `ParticipantRow`, `DocumentRow`, `badgeTones`), `hooks/` (`useMeetingsList`, `meetingPages`, `useMeeting`), `navigation/useOpenMeeting.ts` | `domain`, `application`, `core`, never `infrastructure` |

- `domain` and `application` are pure: they run in plain Node, with no package.
- The `Document` entity is here, as the meeting holds its documents. Opening one is the feature `documents`.
- The in-memory repository of the development build is in `src/composition/dev/in-memory`: it reads the simulated server.
- The intended dependencies are `core` and `auth`. Today a few go the other way, which the next step inverts: the `Meeting` entity imports the `Vote` (`withVoteRecorded` is to move to `votes`), the wire class of a meeting imports the one of a document, `loadMeeting` empties the document cache through the shared deps, and the detail screen shows the voting of `votes`.
- `SqliteMeetingCache` reads the names of the tables from `src/composition/persistence/schema.ts`.
