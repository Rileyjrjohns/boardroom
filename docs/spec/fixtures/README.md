# Fixtures

Frozen demo data of the Boardroom domain: a generic board, invented people, `.example` domains. They are the single source of the data of the React Native app (the `mock` configuration and the local mock API, `npm run mock:api`), and a Flutter client of the same domain reads the very same files. Nothing in them is specific to one client.

The files are JSON, UTF-8, pretty-printed with two spaces and a final newline. The keys of every object are in alphabetical order (the order of the keys means nothing) except `referenceDate`, which comes first; the order of a list is part of the data and is kept.

## The files

Where the HTTP API ([`docs/api.md`](../../api.md)) has an equivalent, the format is the one of the API, so that a client reads these files with the models it already has for its answers. The fields the API does not expose are in files of their own.

| File                  | Holds                                                         | Format                                                                                                                             |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `meetings.json`       | The 66 meetings, with agenda, documents and participants      | `{ referenceDate, meetings }`: each meeting is a `GET /meetings/{id}` answer, with no `recordedVote`                               |
| `recorded-votes.json` | The 62 votes already recorded, whoever cast them              | `{ referenceDate, recordedVotes }`: each vote is a `POST /votes` body (`resolutionId`, `meetingId`, `voterId`, `choice`, `castAt`) |
| `accounts.json`       | The two demo accounts that can sign in, and which one is demo | `{ referenceDate, accounts, demoUserId }`: each account is `{ user, password }`, the `user` being the one of a sign-in answer      |

`meetings.json` is every meeting, in the order of its id (`meeting-001` to `meeting-066`). The summary a list shows (`GET /meetings`: `id`, `title`, `scheduledAt`, `location`) is those four fields of a meeting. Whether a meeting is upcoming or past is not stored: it follows from `scheduledAt` and the clock, as in the API.

### What the API does not expose

- **The accounts and their password** (`accounts.json`). The API checks credentials and never lists accounts. The password of both demo accounts is `boardroom-demo`: it protects nothing, the accounts exist only in the simulation. `demoUserId` names the account that is signed in at start by the mock configuration (`user-alice`); the sign-in screen offers both.
- **The votes already recorded** (`recorded-votes.json`). The API gives a user their own vote on a resolution (`recordedVote` in `GET /meetings/{id}`) and nobody else's. Here every vote of every voter is listed, with `castAt` being the time the server stamped. A resolution of `meetings.json` therefore never carries a `recordedVote`: a client adds the one of the user who asks.
- **Who is invited to which meeting** is not in a file of its own, because the API already says it: the `participants` of a meeting (`userId`, `fullName`, `role`). A user takes part in the meetings that list them, sees only those, and may vote when their role is `chair` or `member` (not `secretary`, not `guest`).

## `referenceDate`

Every file starts with `referenceDate`, an ISO 8601 instant with a zone (`2026-10-01T08:00:00.000Z`): the moment the dates of the files are relative to. All the dates in the files (`scheduledAt`, `closesAt`, `castAt`) are absolute instants, written as the API writes them, and consistent with it: at the reference date, 24 meetings are ahead and 42 behind, every resolution of an upcoming meeting is open, every vote recorded was cast before it.

The files carry the same `referenceDate`, even `accounts.json`, which holds no date, so that a file cannot be mixed with another of a different generation. A client refuses files that disagree.

## The shifting rule

A client that runs in demo mode **shifts every instant of the files by `now - referenceDate`** when it loads them, so that the meetings stay upcoming whatever day the app is launched:

```
loaded = date in the file + (now - referenceDate)
```

- It applies to **every** instant: `scheduledAt` and `closesAt` of `meetings.json`, `castAt` of `recorded-votes.json`. A date left unshifted would no longer be consistent with the others. `referenceDate` itself is not shifted: it is what the shift is measured from.
- It is exact arithmetic on instants (milliseconds since the epoch), done once, with the `now` read once at load. Not calendar arithmetic: no day, month or daylight saving time is involved, and a date written with an offset (`+01:00`) is the instant it stands for. `now` may be before the reference date, the shift is then negative.
- The whole timeline moves rigidly. What was a day ahead of the reference date is a day ahead of `now`, an upcoming meeting stays upcoming, a past one past, a vote closes the same time after its meeting starts, and the distance between any two dates is unchanged. A shift that would take an instant out of the range the domain accepts (before 1970) makes the data invalid.
- **Text is not shifted.** A title that names a month (`Audit committee: Half-year financial statements, October 2026`) names the month of the reference date, whatever the date it is shown at.
- **Any client must apply this same shift**, React Native today, Flutter tomorrow: a client that reads the dates as they are would show the demo as it was on the reference date, with no upcoming meeting once it has passed. A client that does not run in demo mode (it talks to a server) reads no fixture.

## What a client must check

The React Native loader (`src/infrastructure/in-memory/fixtures`) reads the files like an answer of the API, and a client should do the same: the fields exist and have the right type (unknown fields are ignored), every value passes the rules of the domain (a title is not blank, a status is `open` or `closed`, and so on), the files share their `referenceDate`, ids that must be unique are (meetings, documents, accounts, and one vote per resolution and voter), and every id that points elsewhere points to something: `demoUserId` to an account, a recorded vote to a resolution of the meeting it names and to a participant of that meeting. A flaw is an error that the client reports, never a crash.

## What the data contains

Whatever `now` is, the shifted data keeps these properties, which the tests of the React Native app check at several instants:

- 24 upcoming and 42 past meetings, enough for several pages of each; every id and title is distinct;
- two accounts, `alice.martin@boardroom.example` (the demo user, in every meeting: chair, member, secretary once, guest twice, `meeting-004` and `meeting-031`) and `bruno.durand@boardroom.example` (in two meetings out of three), both with the password above; six more people appear as participants only;
- 99 resolutions, 36 in upcoming meetings, all open (some without `closesAt`), and 63 in past meetings: closed with a `closesAt` after the meeting started, except in some meetings where the status was never closed and the voting window is simply over (no vote recorded there);
- the three voting states (open, closed, window over) and the three choices (`for`, `against`, `abstain`) are present; the demo user already voted on the minutes of `meeting-001`, which is upcoming, and can still vote on the main resolution of several other upcoming meetings (`meeting-002`, for one);
- 176 documents, at the three confidentiality levels, each listed by one meeting only.

## Changing them

Edit the files by hand: they are the source of truth. Keep the format above, and run `npm test`, which checks that every file has the shape its schema describes, that the app loads them, and that the invariants above hold. `tooling/generate-fixtures` is the script that made them, once, at the reference date, from the generator that used to be the seed of the app; it says how they were made and running it again overwrites them.

How the React Native app reads them: `src/infrastructure/in-memory/fixtures/loadFixtures.ts` validates the files with the schemas of the API (`src/infrastructure/http/dto`), builds the domain objects through the factories of the domain, shifts the instants, and returns a `Result` instead of throwing.
