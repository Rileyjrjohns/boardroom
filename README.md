# Boardroom

Boardroom is a React Native demo app for board-of-directors governance. It exists to showcase a strict hexagonal (ports and adapters) architecture and production-grade tooling on a mobile codebase: the dependency rule between layers is not a convention, it is enforced by the linter.

> **Status:** scaffold, tooling, internationalisation foundation, the `domain` and `application` layers (business rules, ports, use cases, unit tests), and now the first end-to-end slice: in-memory adapters that simulate a server, the composition root, and the meetings list and meeting detail screens. The app runs against the simulated server, signed in as a demo user. There is no real network, no persistence, no sign-in screen, no voting and no document viewer yet: they come with the next steps.

## Tech stack

| Area          | Choice                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime       | Expo SDK 57, React Native 0.86, React 19 (New Architecture, always on from SDK 55)                                                         |
| Server state  | TanStack Query 5: the query cache, pagination, pull to refresh, retries (see Server state and UI state)                                    |
| UI state      | Zustand 5: the few pieces of interface state that must survive navigation                                                                  |
| Navigation    | expo-router (file-based, typed routes), custom scheme `boardroom`                                                                          |
| Native builds | expo-dev-client with Continuous Native Generation (`ios/` and `android/` are git-ignored)                                                  |
| i18n          | i18next, react-i18next, expo-localization: English and French, English as the fallback, typed keys (see Internationalisation)              |
| Language      | TypeScript, strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; the JS config files are type-checked too (`checkJs`) |
| Lint          | ESLint 9 flat config, eslint-config-expo, eslint-plugin-boundaries, eslint-config-prettier, no-magic-string rules for the UI code          |
| Formatting    | Prettier                                                                                                                                   |
| Tests         | Jest 29 with four projects (`core`, `infra`, `ui`, `tooling`), jest-expo, React Native Testing Library                                     |
| Git hooks     | Husky, lint-staged, a Conventional Commits check written in plain shell                                                                    |

## Getting started

Prerequisites:

- Node.js 24 (see `.nvmrc`) and npm 11.
- For running the app: Xcode (iOS) and/or Android Studio with an emulator (Android).

```sh
nvm use          # picks the Node version from .nvmrc
npm install      # installs dependencies and the git hooks (through the "prepare" script)
npm run validate # lint, typecheck, format check and tests
```

Run the app. The project uses a development client, so Expo Go is not used:

```sh
npm run ios      # generates ios/ if needed, builds the dev client, installs and launches it
npm run android  # same for Android
npm start        # starts Metro for an already installed dev client
```

### Running against the simulated server (mock mode)

In a development build mock mode is the default, so the commands above are all it takes: no server, no account to create, no network. The app starts signed in as the demo user and shows the meetings list. `EXPO_PUBLIC_BOARDROOM_ADAPTERS=mock npm run ios` says the same thing explicitly, and a build that is not a development one (a release build) has to say it, because it never guesses (see the table).

The setting is the environment variable `EXPO_PUBLIC_BOARDROOM_ADAPTERS`, documented in `.env.example` (copy it to `.env`, which is git-ignored, to change it; restart Metro with `npm start -- --clear` afterwards, because Expo reads it when Metro starts).

| Value            | Effect                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| missing or empty | In a development build, the mock adapters: the same as `mock`. In any other build, refused: the code is `missingAdaptersSetting`         |
| `mock`           | The mock adapters: in-memory repositories, caches and outbox, behind a simulated server                                                  |
| `http`           | The real adapters. Not available yet (step 4): the app shows a screen that says so, it does not fall back to the mock adapters           |
| anything else    | Refused: the app shows a screen with the technical code `invalidAdaptersSetting`. A typo must not start the demo against the wrong thing |

The two demo accounts of the simulated server, for when the sign-in screen exists (step 4), share the password `boardroom-demo` (it protects nothing, the accounts exist only in the simulation): `alice.martin@boardroom.example`, who is a voting member of most meetings, chairs some, and attends two as a guest and one as the secretary; and `bruno.durand@boardroom.example`, who is invited to two meetings out of three, so the two users see different lists. The meetings are generated from the clock at start-up, so there are always upcoming and past ones. The resolutions follow the date of their meeting: open before it takes place (the demo user can vote on several right away, the minutes of one are already voted), closed after it started once it is behind, and a few past ones are still open by status although their voting window is over.

`ios/` and `android/` are produced from `app.config.ts` by Continuous Native Generation and are never committed. Native configuration lives in `app.config.ts` and in config plugins, never in the generated folders.

The Git hooks are installed by the `prepare` script, and only when `npm install` runs inside a Git repository. Husky skips the installation without failing when `.git` does not exist yet, so after a `git init` that comes later, run `npm run prepare` once and check that `git config core.hooksPath` prints `.husky/_`.

### Typed routes

`experiments.typedRoutes` is on, but expo-router writes the route types (`.expo/types/router.d.ts`, git-ignored) only while the dev server runs. On a fresh clone, and in CI, `npm run typecheck` does not check `href` values until `npm start` has run once: a misspelled route still compiles. Start the dev server once after cloning, and after adding a route, to get the check locally. Gating routes in CI needs a step that starts Metro briefly before `tsc`; that belongs to the CI/CD step.

### Placeholders in the native configuration

These values are deliberate placeholders, to be replaced before any store submission:

- The bundle identifier and Android package are `com.boardroom.demo`.
- `assets/` holds the images of the Expo template, and `android.adaptiveIcon.backgroundColor` is the template colour. They await the Boardroom brand artwork.
- No splash screen is configured, because `expo-splash-screen` is not a dependency of the project. The generated native projects keep the Expo template defaults: on iOS the launch storyboard references a launch image that is not generated, so the launch screen is blank, and Android shows the template logo. Configuring a real splash screen means adding `expo-splash-screen` (`npx expo install expo-splash-screen`) and its config plugin with an image and a background colour.
- The light appearance is locked on iOS only (`ios.userInterfaceStyle`). Locking it on Android as well needs `expo-system-ui`.

Android is hardened for confidential material: backups are off (`android.allowBackup: false`) and the storage and vibration permissions that the Expo template adds are blocked (`android.blockedPermissions`). `SYSTEM_ALERT_WINDOW` is kept because the development client overlays rely on it; revisit it together with the release build configuration.

### About `.npmrc`

The repository sets `legacy-peer-deps=true`. expo-router's dependency tree declares non-optional peers (`react-dom`, `react-native-reanimated`, and others) that are only useful for web, drawers and animations. Without this setting npm installs them automatically, and `react-dom` resolves to a version that conflicts with the React version pinned by the SDK. With it, only the peers that expo-router strictly requires are installed, and they are declared explicitly in `package.json`.

A consequence: `npm ls --all` exits with an error. It reports `react-dom`, `react-native-gesture-handler` and `react-native-reanimated` as missing, required by dependencies of expo-router (`@radix-ui/*`, `vaul`, `react-native-drawer-layout`). That is expected. Those packages are only reached from web builds and from `expo-router/drawer`, and neither is supported here. Do not add a CI step that requires `npm ls --all` to be clean (plain `npm ls` is clean).

### Peers of the test tooling

- `@react-native/jest-preset` is declared in `devDependencies` on purpose. `jest-expo` 57 requires it as a peer, and `legacy-peer-deps` stops npm from installing peers by itself.
- `react-test-renderer`, a peer of `@testing-library/react-native`, is not declared. npm installs it as a dependency of `jest-expo`, at the version the SDK expects. Declaring it explicitly is an open decision for the repository owner.

### Dependencies of the internationalisation

- `i18next` and `react-i18next` are regular dependencies. `react-i18next` needs `i18next` and `react` as peers, which are declared, and `typescript` as an optional peer, which is a development dependency already.
- `expo-localization` was added with `npx expo install`, so that its version matches the SDK. It provides the device language and a config plugin (see Internationalisation).
- `intl-pluralrules`, the usual polyfill for `Intl.PluralRules` on Hermes, is deliberately not a dependency: see "Plurals on Hermes" below.

## npm scripts

| Script                  | What it does                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `npm start`             | Starts Metro for the development client                                                |
| `npm run ios`           | Builds and runs the iOS development client                                             |
| `npm run android`       | Builds and runs the Android development client                                         |
| `npm run lint`          | ESLint over the whole repository, zero warnings allowed                                |
| `npm run lint:fix`      | ESLint with autofix                                                                    |
| `npm run typecheck`     | `tsc --noEmit`, which also checks the JS config files at the repository root           |
| `npm test`              | Runs every Jest project, without the coverage gate                                     |
| `npm run test:coverage` | Runs Jest with coverage and enforces the 90 percent gate on `domain` and `application` |
| `npm run format`        | Prettier, write mode                                                                   |
| `npm run format:check`  | Prettier, check mode                                                                   |
| `npm run validate`      | `lint`, `typecheck`, `format:check` and `test:coverage`, in that order                 |

## Architecture

The code is organised in layers. Dependencies only point inwards, toward the domain.

| Folder                | Role                                                                                           | May import                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `app/`                | expo-router route files. Thin: they mount screens. The root layout builds the composition root | `presentation`, `di`, `assets/`, external modules (not TanStack Query nor Zustand)                   |
| `src/domain/`         | Entities, value objects, business rules, business errors                                       | `domain`. No external module at all                                                                  |
| `src/application/`    | Use cases and ports (interfaces)                                                               | `domain`, `application`. No external module at all                                                   |
| `src/infrastructure/` | Adapters implementing the ports (in-memory today; HTTP and persistence next)                   | `domain`, `application`, `infrastructure`, external modules (not TanStack Query nor Zustand)         |
| `src/presentation/`   | Screens, components, hooks, stores, i18n, theme tokens                                         | `domain`, `application`, `presentation`, `assets/`, external modules. Never `infrastructure` or `di` |
| `src/di/`             | The single composition root that wires ports to adapters with manual typed injection           | `domain`, `application`, `infrastructure`, `di`. No external module at all. Never `presentation`     |

Two extra rules: the `zod` package may only be imported from `src/infrastructure`, and `@tanstack/react-query` and `zustand` (server state and interface state) may only be imported from `src/presentation`.

Everything else in the repository (`package.json`, the configs, `tooling/`, scripts) is tooling. Code under `app/` and `src/` cannot import it.

Path aliases map to the matching `src` folder: `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*` and `@di/*`. They resolve in TypeScript, Metro, Jest and ESLint.

### Domain and application

The two inner layers hold all the business logic. They are plain TypeScript, in a plain Node environment, with no external module and no ambient global.

**Errors are values.** Every operation that can fail returns `Result<T, E>` (`src/domain/shared/Result.ts`), or `Promise<Result<T, E>>` when it is asynchronous. Production code of `domain` and `application` never throws (a lint rule enforces it; tests and the `testing` folders may), and the contract of every port says that an adapter never throws or rejects: it returns an error `Result`. An error is plain data: a `code` taken from a const object, plus the structured fields that matter (`src/domain/errors`, one file per concern: validation, authentication, repository, voting, vote delivery, biometric, storage, screen protection). It carries no text, because the translation happens in the presentation. The codes are unique across concerns, so a union of errors from several concerns is told apart by `code` alone. The free-text `cause` of an error is a technical diagnostic: it never holds personal data nor the values of a query.

**Plain, immutable data.** Entities are `readonly` plain objects built by factory functions. A factory with something to check returns a `Result` (`createMeeting`, `createResolution`, `createDocument`, ...); one that has nothing to check just builds the data (`createVote`, `createSession`, `createPendingVote`, `createPage`, `createWatermark`). Value objects are branded types with a validating factory (`parseInstant`, `parseMeetingId`, `parseEmailAddress`, ...): a `UserId` and a `MeetingId` are both strings at runtime, and the compiler keeps them apart. There are no classes to map, so the same data goes to SQLite and to the query cache as it is. Every code, role, status, choice and event name is a const object (`VOTE_CHOICE`, `PARTICIPANT_ROLE`, `MONITORING_EVENT`, ...) with its union type derived from it, never a string literal repeated at call sites. Time is an `Instant` (epoch milliseconds), read from the `Clock` port only.

**Business rules are pure functions** (`src/domain/policies`): the eligibility to vote (and the precise reason when not eligible), the biometric app lock, the expiry of a session, the maximum age of a cached entry. Which list a meeting belongs to (upcoming or past) is decided by the server: `MeetingPeriod` is only a query value. The `Watermark` fixes the content of what a confidential document shows (name, email and instant of the reader); formatting the instant and laying the watermark out stay in the presentation.

**The offline policy lives in the application layer**, in one place (`src/application/shared/loadWithCacheFallback.ts`), where it can be read and tested, not hidden in an adapter. The use cases that read meetings and documents need a valid session, and read and write the cache of that user only (every cache operation takes the owner, so reading as another user finds nothing, by construction).

1. Ask the remote source first. Then check that the user it was asked for is still the one signed in and the app still unlocked: a slow request can span a sign-out and a sign-in, and what comes back must neither be written under the previous owner nor returned as the answer to the new one. If somebody else is signed in, nothing is written or returned and the answer is `sessionChanged`.
2. On success, write the data through to the cache and return it flagged `fresh`. A write that fails does not fail the call: the failure is captured, and the entry is removed, so that an older copy that could not be refreshed is not served afterwards as if it were current (a full purge if even the removal fails).
3. When the network is unavailable, and only then, return the cached copy flagged `stale` with the instant it was cached, if it is not older than the maximum age given in the `deps` (an older entry, or one dated in the future, counts as a miss). On a miss, return the network error.
4. `unauthorized` means the session is no longer valid, for anything: both caches are emptied, for every owner. `forbidden` (the session is valid, the user may not have this item) and `notFound` concern one item: it is removed from the cache with what hangs off it, so a meeting takes the documents it lists with it. A removal that fails is captured and falls back on the full purge, so that a copy the server refused is never served afterwards; a purge that fails is captured. The error is returned.
5. Any other error (`unexpected`) is returned as is.

Known limit: the pages of the list that were cached are not walked on a revocation. A cached page that shows the title of a meeting that became forbidden keeps showing it until it is refreshed or expires; opening the meeting is refused, and its detail and documents are gone.

A cache that cannot be written, read or evicted does not fail the call, the failure is captured by the monitoring. Signing out, signing in (over whoever was signed in before: it also retries a purge that failed earlier), ending an expired session at start, and the session guard meeting an expired session while the app runs, all empty both caches (the stored content of the documents included); the vote outbox is kept, because a vote belongs to its voter and must be sent when they come back. `ListMeetings`, `GetMeeting`, `OpenDocument` and `CastVote` all use the policy.

| Port (`src/application/ports`) | Role                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `MeetingRepository`            | Remote source of truth: a page of meetings for a period, one meeting                                                                  |
| `MeetingCache`                 | Local store of pages and meetings, per owner: save, read (a miss is a value, not an error), remove, purge                             |
| `DocumentRepository`           | Remote documents: metadata, and the local location of the downloaded content                                                          |
| `DocumentCache`                | Local store of documents already viewed (metadata and location), per owner; `remove` and `purge` also delete the stored content       |
| `VoteRepository`               | Remote votes. Idempotent on the idempotency key; a business rejection is distinct from a network failure; never trusts `castAt`       |
| `VoteOutbox`                   | Durable local store of the votes of each voter, pending or rejected, oldest first. Reads are scoped by voter. Not cleared at sign-out |
| `AuthSession`                  | Sign in, current session, sign out. Tokens stay inside the adapter                                                                    |
| `BiometricGate`                | Availability and authentication, for a reason (`unlockApp`, `confirmVote`). No prompt text crosses the port                           |
| `ScreenProtection`             | A dumb global switch (enable, disable) and the capture events. Which documents need it is decided by `ScreenProtectionCoordinator`    |
| `Clock`                        | `now()`                                                                                                                               |
| `Monitoring`                   | Structured logs and error capture. Events and attribute names are const sets                                                          |

Every method of every port settles in bounded time; a remote adapter maps a timeout to `networkUnavailable`, a local store to a storage error.

| Use cases (`src/application/use-cases`) | What they do                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/SignIn`                           | Validate the credentials and sign in                                                                                                                                                                              |
| `auth/SignOut`                          | Empty the caches, then sign out. A cache that cannot be emptied does not stop the sign-out                                                                                                                        |
| `auth/RestoreSession`                   | Cold start: no session, or the requirement to unlock the app (the status only, no name nor email before the unlock). Locks the app. An expired session is ended (caches emptied, signed out) and reported as none |
| `auth/EvaluateAppLock`, `UnlockApp`     | Must the app be unlocked on return from the background; unlock it with the biometrics. `UnlockApp` fails closed                                                                                                   |
| `meetings/ListMeetings`, `GetMeeting`   | Need a session. Meetings with the offline policy                                                                                                                                                                  |
| `documents/OpenDocument`                | Needs a session; protects the screen of a confidential document, or of any document served from the cache (fails closed); watermark of the user checked after the load; access log; offline policy                |
| `documents/CloseDocument`               | Releases a document; the screen protection goes off when no confidential document is left open                                                                                                                    |
| `documents/ObserveScreenCapture`        | Needs a session; logs the capture events with the document and user ids, forwards them, and succeeds with the unsubscribe function                                                                                |
| `votes/CastVote`                        | Needs a session; checks eligibility; biometric confirmation; submits, or queues the vote when the network is down or the server fails unexpectedly                                                                |
| `votes/SyncPendingVotes`                | Sends the pending votes of the signed-in user, oldest first; see below                                                                                                                                            |
| `votes/ListPendingVotes`                | The outbox of the signed-in user, pending and rejected votes told apart                                                                                                                                           |
| `votes/AcknowledgeRejectedVote`         | Deletes a rejected vote once the user has seen it                                                                                                                                                                 |

A use case is a class with a single public `execute` method (`ObserveScreenCapture` also takes the callback to call). Its dependencies are injected through the constructor as one typed, `readonly` `deps` object of ports, plus the configuration values it needs (`maxCacheAge`, `maxAttempts`, `gracePeriod`). There is no static state and no singleton; the few instances that guard something in memory (`SyncPendingVotes`, `CastVote`, `ScreenProtectionCoordinator`, `AppLock`) must be created once by the composition root and shared.

**Votes.** A vote is final: a voter has one vote per resolution, identified by an idempotency key built from the resolution and the voter. Sending a vote again is safe as long as the server honours that key, which the `VoteRepository` contract requires: a retry after a lost answer is recorded once.

- `CastVote` refuses a second vote on a resolution being cast on the same instance (`voteInProgress`), checks the eligibility against the meeting (cached or fresh) and the outbox, then asks for the biometric confirmation. A submitted vote is also recorded on the cached copy of its meeting, so that the voter cannot vote again from it offline.
- The outbox keeps a vote in one of two states, pending or rejected, which cannot be mixed up: a rejected vote always carries its reason.
- `SyncPendingVotes` is triggered by the presentation or the composition root, when connectivity is regained and when the app returns to the foreground; the application layer does not watch the network. It sends the pending votes oldest first, one at a time, and checks the session again before each one (a run stops if the user signed out or changed, or the app was locked; it does not start while the app is locked). Its report names the resolutions and the reasons, never the choices. A vote the server rejects for a business reason is kept as rejected, with the reason, until the user acknowledges it. Only `networkUnavailable` and `unauthorized` stop the whole run; they concern every vote and count no attempt. An `unexpected` failure counts an attempt on that vote and the run goes on with the next one; after `maxAttempts` the vote is given up as `voteUndeliverable` and shown to the user. A second call while a run is in progress on the same instance does nothing (`alreadyRunning`); two instances, or two processes, are protected by the idempotency key only.

**Biometric lock.** The lock is enforced, not only reported. `AppLock` is one shared in-memory state that the session guard (`requireSession`, which every use case that serves the user goes through) reads: while it is closed, the guard answers `appLocked` and no use case returns data, queues or sends anything. A cold start always closes it (`RestoreSession` returns the status `unlockRequired` and nothing about the user), `EvaluateAppLock` closes it when the grace period in the background is over or cannot be judged, `UnlockApp` opens it when the biometrics succeed, a successful `SignIn` leaves it open (the credentials just typed are the proof of presence) and `SignOut` closes it. On a device where the biometrics cannot be used, `UnlockApp` fails closed every time, and the only way forward is to sign out and sign in again. The biometrics prove that a person enrolled on the device is there, not that it is the user of the session; whether the device passcode is accepted as a fallback is a setting of the adapter, chosen at the composition root.

**Screen protection.** `ScreenProtectionCoordinator` counts the views of each document (a document opened twice is two views) and serialises its calls to the platform, so that the last view of all turns the protection off and a slow `disable` can never land after a later `enable`. `OpenDocument` protects a confidential document and any document served from the cache, whatever level the cache remembers: a copy may have been public when it was saved.

**The session is checked again.** The session guard also detects an expired session while the app runs (both caches are emptied, best effort, and the caller still gets `sessionExpired`). A use case that waits for something (the network, a biometric prompt) checks again, with `requireSameUser`, that the same user is still signed in before it writes or returns anything.

**Test doubles** live in `src/application/testing/` (and the builders of domain fixtures in `src/domain/testing/`, because the domain tests need them and the domain cannot import the application). They are hand-written, in-memory fakes of every port, scriptable (a switch for the network, failures of the storage, queued answers of the server) and checked against the contract of the ports by `fakes.test.ts`. They exist so that the use cases are tested without `jest.mock`, against objects that behave like the real thing. They are test support, not production code: they are excluded from the coverage figures, a fixture there may throw, and a lint rule forbids production code from importing any `testing` folder.

### Clock limits

Time is the clock of the device, read through the `Clock` port, and the user controls it. What the rules built on it do about that:

- Session expiry (`expiresAt`) is on the device clock: a clock set back extends a session locally, a clock set forward ends it early. The server enforces its own expiry on every call.
- The age of a cached entry is compared with the device clock. An entry dated in the future (the clock was set back) is a miss, and so is one older than the maximum age. A clock set back far enough that an old entry looks young cannot be detected, and keeps an entry usable longer than the maximum age.
- The app lock fails closed when the clock goes back (`now` earlier than the instant the app went to the background), and a grace period of zero locks every time. A clock set forward only locks sooner.
- `castAt` of a vote comes from the device. The `VoteRepository` contract says that the server stamps the vote with its own time and applies the voting window to it. The local eligibility check (`votingWindowOver`) is a courtesy that can be wrong in either direction.
- The ordering of the outbox is the order of enqueueing, not a comparison of instants.

### In-memory adapters and contract tests

`src/infrastructure/in-memory` holds an adapter for every port, so that the whole app runs without a server, and `clock/` and `monitoring/` hold the two that are not in-memory by nature.

| Adapter                                                                             | What it is                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `InMemoryMeetingRepository`, `InMemoryDocumentRepository`, `InMemoryVoteRepository` | Three thin windows on one `InMemoryBackend`, the simulated server, so that a vote recorded through one is seen through the others                                                          |
| `InMemoryMeetingCache`, `InMemoryDocumentCache`, `InMemoryVoteOutbox`               | The local stores, per owner and per voter. They copy what they are given and what they hand back. The document cache answers for the files of the device (`InMemoryDocumentContent`)       |
| `InMemoryAuthSession`                                                               | The accounts of the simulated server and the session store of the device in one. Sessions expire a lifetime after the sign-in, on the clock it is given. No tokens exist, so none can leak |
| `InMemoryBiometricGate`, `InMemoryScreenProtection`                                 | Biometrics that are always available and always recognise the user; a screen protection that records what it was asked and can report a capture. Both can be made to fail, for tests       |
| `SystemClock`, `ConsoleMonitoring`                                                  | The clock of the device (the only production code that reads it), and structured events written to the console                                                                             |

**The simulated server** (`InMemoryBackend`) behaves the way the port contracts describe a real one. Every request enters the network first (`networkUnavailable` offline, then the latency), then is authenticated from the stored session (`unauthorized` without a valid, unexpired one). The identity is read when the request is created, and the answer is the one for that identity even if somebody else signs in while the request waits. A user sees the meetings they take part in. A meeting, or a document of a meeting, that exists but that they may not have is `forbidden`; one that does not exist is `notFound`. Telling the two apart shows that an id exists, which costs little here (ids are opaque and a board is a closed group) and lets the app say "you no longer have access"; a server that prefers to hide it answers `notFound`, which the application treats the same way. Which of the two lists a meeting is in is decided against the clock; upcoming ones are soonest first, past ones latest first, ties broken by id. The limit of a page is checked with the page rules of the domain, not trusted, and pages continue after an opaque cursor (the instant and the id of the last meeting) that stays valid when a meeting moves from one list to the other between two pages. The decoder of the cursor is strict: `1e3`, hexadecimal, a space, a negative number or an extra segment is refused. A vote is recorded for the authenticated user only, once per resolution, under a key the server derives itself. A key that already holds a vote is answered before any rule of eligibility, so that a replay still works after the resolution is closed: the same vote again succeeds, another choice is `alreadyVoted`, whatever the clock says. A voter that is not the authenticated user is `unauthorized`. The business rules are the ones of the domain (`checkVotingEligibility`), applied at the time of the server, which stamps the vote with its own time and never trusts `castAt`: a vote whose device time is after the closing instant is accepted while the server's time is still before it. Resolution ids are unique across all meetings (the domain says so for the id and for the idempotency key built from it), and the server refuses content that breaks it. The document location is per user and per revision of the document, so the content one user fetched does not serve another. A meeting returned to a user carries their own recorded votes. Everything it returns is a copy.

**The seed** (`seed.ts`) is the content of the server, generated from the clock when the app starts: 24 upcoming and 42 past meetings, nothing random. Its resolutions follow the date of the meeting: in an upcoming meeting they are open, with a closing time after the meeting starts or none; in a past meeting they were closed after it started, with the votes of the demo users on most of them (the demo user voted for, against and abstained in turn), except in some meetings where the status was never closed and the window is simply over, with nobody having voted. All three states of voting, all three choices, a meeting where the demo user is a guest and several resolutions they can vote on right away are in the data at any start instant (`seed.test.ts` checks it at several). It is server data, so it is in English whatever the language of the app. It is built through the domain factories, so a seed that breaks an invariant makes `buildSeed` return the error (and its test fail), and the container then refuses to start.

**The network** (`SimulatedNetwork`) is the connectivity of the server, owned by the backend (`backend.network`): `setOnline(boolean)` is the one way to cut or restore it, and `setLatency()` changes how long the server takes. Every client of the server goes through it, so going offline cuts them all, deterministically; `container.controls.network` hands it to the demo and to the tests of steps 4 and 6. The latency is a `Sleep` function handed in at construction, so the domain and the application contain no timer and the tests, which give a sleep that does not wait (`src/infrastructure/testing/sleep.ts`), never sleep. A request never waits more than `MAX_SIMULATED_LATENCY_MILLIS`, whatever is configured, because every port settles in bounded time: a latency above the cap is a timeout and answers `networkUnavailable` once the cap has elapsed, and a sleep that throws or rejects is a network that failed and answers `networkUnavailable` too. Nothing escapes the port.

**The monitoring** (`ConsoleMonitoring`) writes each event to the channel of the console that matches its level, through a map typed over every level: a level added to the port without a channel fails the typecheck instead of being dropped. Serving data from the cache is expected behaviour (it is what the offline demo shows), so it is logged at `info`: a warning would raise a LogBox toast in development. The tests of the container are given a silent monitoring through the runtime override, so they print nothing.

**Contract tests.** For each port that holds state or talks to a server there is a reusable suite, a function that takes a factory and registers the same `describe` against any implementation: `describeMeetingCacheContract`, `describeDocumentCacheContract`, `describeVoteOutboxContract`, `describeMeetingRepositoryContract`, `describeDocumentRepositoryContract`, `describeVoteRepositoryContract`, `describeAuthSessionContract`, `describeScreenProtectionContract` (`src/application/testing/contracts`). That is eight suites for eleven ports. `BiometricGate`, `Clock` and `Monitoring` have none, on purpose: they hold no state and are thin. The first is one question and one prompt that the platform answers (the in-memory adapter only replays what it is told, and the real one, in step 4, wraps the platform), the second is a single call that returns the time, and the third is fire and forget and returns nothing a test could read. Their adapters are tested directly. The suites only use the public surface of the port, plus a small harness the factory provides where a port alone cannot say it: to put meetings on the server, to cut the connection, to lose a downloaded file, to move the clock of the server. The caches and the outbox suites check, among others, the isolation of two owners or voters (also under ids that would collide if the owner and the id were concatenated), that `purge` removes everything for every owner, that a miss is a value and not an error, first in first out by insertion (the votes are enqueued with decreasing instants, so that an adapter that sorts by the instant fails), idempotent `enqueue` that reports the vote that holds the key, the rejected state (also through `findByResolution`), and that mutating an object after saving it or after reading it changes nothing the next read returns. The repository suites check, among others, that a recorded vote of one user is not seen by another, and the clauses of the vote that depend on time (a replay or another choice after the close, a late `castAt`).

Every suite runs against the fakes of the application (`src/application/testing/fakes.contracts.test.ts`) and against the in-memory adapters (the tests next to them, in the `infra` project). A group that an implementation cannot honour shows as skipped, not as passed: the fakes keep no files (so the checks on the content of documents are skipped for them) and their server only replays scripted answers (so the business rules of a vote are skipped). The SQLite and HTTP adapters of step 4 will run the same suites. The suites of the caches and of the outbox do not yet inject a storage failure nor reopen the store to check that the data survived: an in-memory adapter has no storage to fail and nothing to reopen. Both checks are added with the SQLite adapters in step 4, where they mean something.

**Why there are fakes and adapters.** The application has its own fakes of the ports (`src/application/testing`) and the infrastructure has its in-memory adapters, and they do not share code. They answer different needs. The fakes belong to the layer that is tested with them: `application` may not import `infrastructure`, so a use case test cannot use an adapter, and the fakes have switches that an adapter must not have (make the next write fail, queue the answer of the server, see what was asked). The adapters are a working implementation that the app runs on, a simulated server with its own rules. The contract suites are what keeps the two honest: both pass the same checks, so a fake cannot drift from what a real adapter does without a test failing.

### Composition root

`src/di` is the one place where ports meet adapters, by manual, typed constructor injection: no container library, no lookup by name, no module-level instance.

| File                              | Role                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`                       | The configuration values, each with a one-line reason: the maximum age of a cache entry, the number of delivery attempts, the app lock grace period, the page size, the simulated latency and session lifetime |
| `adapters.ts`, `configuration.ts` | The two configurations as a discriminated union (`mock`, `http`), and the parsing of the environment setting                                                                                                   |
| `Ports.ts`                        | An adapter for every port, and the configuration values the use cases take                                                                                                                                     |
| `mockPorts.ts`                    | The adapters of the mock configuration, wired to each other                                                                                                                                                    |
| `wireUseCases.ts`                 | Builds the use cases from the ports. The same for every configuration                                                                                                                                          |
| `createContainer.ts`              | `createContainer(config, runtime)` and `startContainer(setting, environment, runtime)`: the container, or an error                                                                                             |

`createContainer` returns a `Result`. The `http` configuration exists in the type system, but its adapters arrive with authentication in step 4, so it answers `configurationNotAvailable` instead of falling back to the mock one or throwing. The container holds the use cases, the settings the screens need (`meetingsPageSize`) and the controls of the configuration (in mock mode, the simulated network). Stateful objects are single shared instances, built once per container: `ScreenProtectionCoordinator` (shared by `OpenDocument` and `CloseDocument`), `CastVote` and `SyncPendingVotes` (their guards live in the instance). `ContainerRuntime` replaces the clock, the monitoring and the sleep for a test. The mock configuration carries what varies between demos, each with its default in `config.ts`: whether the demo user is signed in at start (in which case the app starts unlocked, as after a sign-in; otherwise it starts locked, as after a cold start), the latency of the server and the lifetime of its sessions; the wiring of the ports reads them from the configuration and imports none of them.

**Where the environment is read.** The setting is `EXPO_PUBLIC_BOARDROOM_ADAPTERS`, and it is read once, in `app/_layout.tsx`, and nowhere else: Metro replaces the exact expression `process.env.EXPO_PUBLIC_...` with its value when it bundles, `domain`, `application` and `di` take no external input (`di` imports no external module), and the layout is the entry point that builds the container. The raw value goes to `startContainer` together with whether this is a development build (the layout reads `__DEV__`; `di` reads no global), which parses and validates it: a missing or empty value means `mock` in a development build and is the error `missingAdaptersSetting` in any other, so that a release build never starts on the simulated server because a variable was forgotten; anything unknown is `invalidAdaptersSetting`. When the container cannot be built, the layout shows `StartupFailureScreen` with the technical code, instead of the app. `tooling/environment.test.ts` fails if a second place reads the environment, or if a variable is missing from `.env.example`.

### Server state and UI state

**How the screens get the use cases.** Presentation declares the shape it needs (`AppServices` in `src/presentation/services`: the use cases it calls and the settings it reads) and exposes it to the hooks through React context. The root layout hands the container to `AppProviders`, which also creates the query client and the interface store of this app instance. Presentation never imports `di`, and the container satisfies the interface structurally. A query function calls a use case, never an adapter or a port.

**From a `Result` to query state** (`query/QueryFailure.ts`). A use case returns a `Result`; a query function returns data or throws. The choice made: the query function throws a `QueryFailure` that wraps the error of the `Result`, instead of returning the `Result` as the data of the query. A failed query then goes to its error state, keeps the data of its last success next to the error (so a failed refresh or a failed next page does not blank the list), exposes `error.error.code` typed as one of the codes of the domain, and lets the retry look at the code. Returning the `Result` as data would make every query "successful", hide failures from `isError` and from the retry, and turn a failed page into one more page.

| Error code                                                                          | Retried               | What the screen does                                                               |
| ----------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `networkUnavailable`, `unexpected`, `storageReadFailed`                             | Twice, with a backoff | Keeps what it has next to the error, with a retry button                           |
| `unauthorized`, `notAuthenticated`, `sessionExpired`, `sessionChanged`, `appLocked` | Never                 | The session is over for the whole app: see below                                   |
| `forbidden`, `notFound`, `validation`                                               | Never                 | The error replaces the content, never what was loaded before, with no retry button |

Whatever a query rejects with goes through one function, `errorCodeOf` (`query/errorCode.ts`): a `QueryFailure` gives its code, and anything else (an `Error`, a string, a code no screen has a text for) is `unexpected`. The retry policy, the screens and the query cache all use it, so a bug that rejects with something else shows an error instead of crashing a screen.

**A failure that asking again cannot fix is final for the screen.** It shows the error and never the data it had, and offers a retry button only when the code is one a retry can fix (`isRetryableCode`), in the error that replaces a screen, in the error next to content (`InlineError`) and in the footer of a next page that failed, which says why with the text of the code. The use case has already evicted the saved copy in these cases; the screen no longer keeps the copy in memory on the screen either.

**A failure that ends the session ends it for the whole app.** The codes `unauthorized`, `notAuthenticated`, `sessionExpired`, `sessionChanged` and `appLocked` are handled in one place, a handler of the `QueryCache` set up where the query client is created (`query/createQueryClient.ts`). It tells the interface store why, then empties the whole cache, so nothing of the previous session stays in memory. `AppProviders` then replaces the screens with `SessionEndedScreen` (the error, no retry): a screen that stayed mounted would build its query again on the empty cache, ask again, and be refused again. Step 4 puts the sign-in and the unlock screens in its place. `discardSessionData(client)`, exported from the same module, is what the sign-out of step 4 calls to empty the cache: the screens that show data must be left first, because nothing tells a mounted observer that its query is gone.

**Query keys** are built by one typed factory (`queryKeys`), from named constants. The user is not in the key. The query client is created per app instance and holds one session at a time, which is only true because the cache is emptied when the session ends: by the handler above, and by `discardSessionData` at the sign-out of step 4 (nothing signs a user out yet). Without that call a second user would be shown the rows of the first until their own request answers; `screens/failures.test.tsx` shows it both ways.

**Cache policy** (`QUERY_STALE_TIME_MILLIS` and `QUERY_GC_TIME_MILLIS`, with their reasons). Data counts as current for one minute: coming back to a screen or to a period inside it shows what is held and asks nothing, and after it the screen shows what it holds at once and checks with the server in the background. The persistent copy and the offline rules belong to the use cases, so this cache is only there to avoid asking again for what was just asked, and a short window is enough; revalidating a list of several pages asks for every page loaded, one after the other, which is not worth doing at every return. An unused query is dropped after five minutes: the data is confidential and must not stay in memory for the whole session. A pull to refresh does not revalidate every page: it cuts the list back to its first page and asks for that one (`restart` in `useMeetingsList`), and the next pages are asked for again as the user scrolls.

**Interface state** is a Zustand store, created per app instance and provided through context, again with no module-level store, so tests are isolated. It holds two things: the selected period of the meetings list, and why the session ended once it has. The period does not need a store today: the list stays mounted below the detail screen, so a `useState` would keep it as well; it is in the store because the stack mandates one for interface state and this is the first piece of it. The second needs one: it is written by the query cache, outside any component, when a failure ends the session, and read by the root of the app, and the cache that was just emptied cannot remember it. Server data is not in the store, and state that belongs to one component stays in `useState`.

**The screens.** The meetings list has two periods behind an accessible segmented control (a `tablist` of `tab`s that say which is selected, at least 44 points tall). Each period is a list of its own (keyed by period), with its own pull to refresh in progress and its own scroll position. It has infinite cursor pagination with `useInfiniteQuery` (the `select` that builds the view of the pages is a stable function, so the query keeps its result between renders), pull to refresh, and every state: loading, empty, error with a retry (only when trying again can help), the end of the list, a next page that failed (with its own retry) and a refresh that failed (the list stays). A banner says "Showing saved data from ..." whenever a page comes from the cache; for a list of several pages it is dated with the oldest saved page, and the rows are not told apart (one banner for the whole list is the conservative reading, and pages of mixed freshness are not marked row by row). The list is a `FlatList` with a stable `keyExtractor`, a memoised `renderItem` and memoised rows. The meeting detail shows the header, the agenda in order with the resolution of an item, the documents (confidentiality, page count) and the participants (role), with loading, error, not found and saved-copy states; the route parameter is parsed first, and one that is no meeting id is not found. Resolutions and documents are display only: their components take no callback, because voting (step 4) and opening a document (step 5) are not there yet, and there is no disabled button standing in for them.

**Where voting stands.** The domain has one function that says it at an instant (`getVotingState`: open, closed, or window over), and the eligibility policy uses it, so a screen and the rules cannot disagree. The presentation reads no clock: the answer of a use case carries the instant it was produced at (`loadedAt` of `Loaded`, the instant of the clock when the use case answered, for a saved copy as well as for fresh data), and the resolution is judged at that instant. A screen that stays open past a closing time shows the state it had at the last load until it is loaded again. The badge says Open, Closed or Voting ended; the line under it is a deadline for an open vote and "Closed on" a date otherwise (for a resolution closed by hand, the date is its scheduled end).

**Navigation.** The detail screen of a meeting is singular in the stack (`dangerouslySingular`, the current name of the `getId` of React Navigation, which expo-router deprecates): a second tap on a row before the screen comes up, or a link opened twice, goes to the screen that is open instead of stacking another one. A screen that fails while it renders is replaced by `AppErrorBoundary`, exported from the root layout as `ErrorBoundary` the way expo-router expects (the route file only re-exports it): the message of an unexpected error in the language of the device, and a button that renders the screen again. The boundary sits above the providers of the layout, so it brings its own translations and its own status bar.

**System bars.** The theme is light only, so the content of the status bar (clock, signal, battery) is dark on both platforms, from one token (`statusBarStyle` in `theme/tokens.ts`) read by `AppStatusBar`. Left to the system, Android follows the dark mode of the device and draws light icons on the white header. The component is React Native's `StatusBar`, mounted once in the root layout and in the error boundary, so that every screen is under it, the stack's and the ones outside it (session ended, startup failure, error). The `statusBarStyle` option of the native stack was not used: it only reaches the screens of the stack, it is ignored on iOS here (the generated Info.plist has `UIViewControllerBasedStatusBarAppearance` false), and on Android react-native-screens takes over the window on every transition as soon as one screen gives it a style, so the two must not be mixed. The `StatusBar` component sets the appearance through the window insets controller, which works when the app draws edge to edge; only its colour and translucency props are ignored there, and none is used. Checked by tests on the style that is asked for, not on a device.

**Dates, numbers and the region.** Dates, times and counts are formatted with `Intl` for a locale chosen from the device (`i18n/localeTag.ts`): when the first language tag of the device in the language shown has a region, the full tag is used (`en-GB` gives the day before the month and a 24 hour clock, `fr-CH` the Swiss grouping of digits); otherwise the bare language. The formatters are created once per locale by `FormattersProvider` (inside `I18nProvider`) and shared by every component, not made again by each row. Counts are written by `translateCount`, which takes the formatter of the locale: the plural keys show `{{formattedCount}}`, never the raw number. Time zone labels are not shown: times are in the zone of the device.

**Screen readers.** The states that show up on their own are not silent. A text that appears while the user looks elsewhere (an error, the notice that the data is a saved copy) is a `LiveText`: an alert, a polite live region on Android, and an announcement on iOS (`useAnnounce`, which does nothing on Android where the live region does it). The loading state is a busy progress bar with a name, the list is marked busy while it loads or refreshes, and a refresh in progress is announced on iOS. All the texts are translated. This was not verified with VoiceOver or TalkBack: the tests check what is asked of the platform (the roles, the state, the live region and the announcement), not what is spoken.

Domain codes become translation keys through typed maps, each declared over the whole set of its codes (`i18n/translationKeys.ts`): a code without a text fails the typecheck. The same goes for the colour of the badge of a confidentiality level or of a voting state (`components/badgeTones.ts`) and for the title of each screen of the stack (`navigation/screenTitles.ts`).

### How the rule is enforced

- `eslint.config.mjs` classifies the files under `app/`, `src/` and `assets/` into the elements above with eslint-plugin-boundaries, and declares which element may depend on which.
- The plugin sees every file of the repository, dot files and dot folders included. A file under `app/` or `src/` that does not belong to any layer is an error (`boundaries/no-unknown-files`), and so is an import of any file that is not an app, layer or asset file, such as a script, a config, `package.json` or a test helper (`boundaries/no-unknown-dependencies`). Only `app/` and `presentation` may import `assets/`.
- Imports of external modules and Node.js core modules are checked too, which is what keeps `domain` and `application` free of any framework.
- A layer alias that does not resolve to a file is rejected instead of being mistaken for an external package. Aliases are resolved from an absolute tsconfig path, so ESLint gives the same result from any working directory.
- Type-only imports are checked like any other import, and so are `import('x')` types, `typeof import('x')`, `import x = require('x')`, `jest.mock` and the other Jest module calls, and `require.resolve`.
- `import()`, `require()`, the Jest module calls and `require.resolve` only accept a string literal under `app/` and `src/`, because a specifier built at runtime cannot be checked (`no-restricted-syntax`). `/// <reference path="..." />` is rejected as well.
- Packages are imported by name, never through a path in `node_modules` (`no-restricted-imports`), and every imported package must be declared in `package.json`, development dependencies being reserved to tests, test support (the `testing` folders, which hold the render helper of the screens) and tooling (`import/no-extraneous-dependencies`). Until `zod` is declared as a dependency, even `src/infrastructure` cannot import it.
- `src/domain` and `src/application` cannot use the ambient globals that reach the runtime environment: `process`, `window`, `document`, `fetch`, `localStorage`, timers, `console` and similar (`no-restricted-globals`). Their tests are exempt.
- In the production code of `src/domain` and `src/application`, `throw` is forbidden (every failure is an error `Result`) and so is every read of the system clock: `Date.now()`, `new Date()` without an argument, `Date()` called as a function, and `performance.now()` (time comes from the `Clock` port). `new Date(millis)` stays allowed, it is a conversion (`no-restricted-syntax`). Tests and the `testing` folders are exempt.
- Production code cannot import from a `testing` folder, whether through a relative path or an alias, a type import or a re-export (`no-restricted-imports`). Tests and other test support can. A dynamic `import()` or a `require` of a `testing` folder is not detected by this rule.
- `no-restricted-syntax` and `no-restricted-imports` apply to a set of files as a whole: in a flat config a later block replaces the options of an earlier one instead of merging them. `eslint.config.mjs` builds the options of each block with `restrictSyntax` and `restrictImports`, which always carry the restrictions that apply to every file (the computed module specifiers), and `tooling/lint-rules.test.ts` checks that none is lost for any set of files.
- `@tanstack/**` and `zustand` (and their subpaths) are rejected outside `src/presentation`, by a dependency policy with its own message (`tooling/lint-rules.test.ts` checks it for every layer and for the route files).
- `.mts` and `.cts` files are linted with the TypeScript parser like `.ts` files.

Known limit: an aliased `require` (`const r = require; r('x')`) cannot be detected by a lint rule.

### Tests

Test files are named `*.test.ts(x)` or `*.spec.ts(x)`. Jest runs four projects (`jest.config.js`):

- `core` covers `src/domain` and `src/application` in a plain Node environment, with no React Native or Expo setup. If either layer reaches for a framework API, its tests fail. Nothing is mocked with `jest.mock`: the use cases are tested against the in-memory fakes of the ports, and the fakes are checked by the contract suites (see In-memory adapters and contract tests).
- `infra` covers `src/infrastructure` and `src/di` on the `jest-expo` preset, which mocks the native side of the Expo modules. The in-memory adapters run the contract suites there, and the container is tested end to end with the real adapters.
- `ui` covers `src/presentation` on the `jest-expo` preset, with React Native Testing Library. Route files stay thin, and the screens are tested on their own. `src/presentation/navigation/rootLayout.test.tsx` renders the real route tree (`app/_layout.tsx` and its routes) with `expo-router/testing-library` and the real composition root behind it, so a root layout that stops mounting a provider fails a test. The i18n stack is never mocked: components are rendered with the real i18next and react-i18next, and a test sets the language through the provider, or, for the device language, by spying on `useLocales` (`i18n/testing/setDeviceLanguages.ts`).
- `tooling` covers `tooling/`, in a plain Node environment. It checks the repository itself: the tsconfig aliases match the folders of `src` and the Jest module name mapper, every test file lives under the root of a Jest project (a test that no project would run fails the suite), no test file sits under `app/`, the `commit-msg` hook accepts and rejects the right messages, the lint rules accept and reject the right snippets: the UI code rules, the purity of `domain` and `application`, the imports of test support, and that no restriction is lost when blocks of the configuration overlap (`lint-rules.test.ts`, which lints them with the real configuration through `lint-snippets.mjs`), `app.config.ts` declares the same languages as the source code, the environment is read in the root layout only and every variable it reads is in `.env.example` (`environment.test.ts`), and the route constants match the files under `app/` (`routes.test.ts`).

The fakes of the caches and of the outbox keep copies of the objects they are given and hand back copies, as a real adapter does by turning the data into rows and back; the contract suites check it. What is true of a fake is still not proof for an adapter, which is why every adapter runs the same suites as the fake.

The tests of the screens use real use cases over the application fakes (`createFakes`), the real i18n and the providers of the app (`AppProviders`, with the query client of production, its cache policy included, and the real interface store), through `src/presentation/testing/renderScreen.tsx`. The one thing the helper changes is the delay of the retries, which is zero. They use fake timers: a list batches the update of its rows on a timer, which with real timers lands between two awaits of a test, outside `act`. A query client keeps a timer for every query it holds, which would keep the test process alive: `testing/queryClients.ts` empties the clients of a test when it ends, after the screen is left. Nothing is replaced with `jest.mock`.

Do not put test files under `app/`: expo-router would treat them as routes.

The path aliases are declared once, in the `paths` of `tsconfig.json`. TypeScript, Metro and ESLint read them there, and `jest.config.js` derives its module name mapper from them.

The 90 percent coverage threshold (statements, branches, functions, lines) on `src/domain` and `src/application` is registered automatically as soon as a layer contains source files. It is checked by `npm run test:coverage`, which `npm run validate` ends with. The `testing` folders (fakes and builders) are not counted: they are test support.

### Folder layout

```text
app/                      expo-router routes (_layout.tsx, index.tsx, meetings/[meetingId].tsx)
src/
  domain/                 entities, value-objects, policies, errors, shared (Result, Brand)
    testing/                builders of fixtures for the tests (test support)
  application/            ports, use-cases (by feature), shared (offline policy, session)
    testing/                fakes of the ports, and the contract suites in contracts/ (test support)
  infrastructure/
    in-memory/            the simulated server, the in-memory caches, outbox, auth, biometrics, screen protection, the seed
    clock/                SystemClock, the sleep behind the simulated latency
    monitoring/           ConsoleMonitoring
    testing/              a sleep that does not wait, the simulated server wired for tests (test support)
    http/                 (step 4)
    persistence/          (step 4)
  presentation/           screens, components, hooks
    i18n/                 translations, language detection, provider, maps from codes to translation keys
    theme/                design tokens (colours, spacing, font sizes, touch target)
    query/                query client and its session handling, query keys, the Result to query convention, retry policy, error codes
    services/             the use cases and settings the screens need (context), and the providers of the app
    state/                the interface store (Zustand)
    format/               dates, times and numbers for the locale of the user, and the provider that shares them
    accessibility/        what the screen reader is told (announcements)
    navigation/           routes, the navigator, opening a meeting, the error boundary
    testing/              render helper, query client tracker and fixtures for the screens (test support)
  di/                     composition root: configuration, ports, wiring, container
assets/                   app icons (Expo template placeholders)
tooling/                  tests of the repository configuration (including the lint rules), types for the JS configs
.env.example              the settings the app reads from the environment
app.config.ts             typed Expo config
eslint.config.mjs         ESLint flat config with the architecture rules
jest.config.js            Jest projects and coverage gate
```

## Internationalisation

Every user-facing text is translated, from the first screen. The app ships English and French. English is the fallback language and the source of truth for the set of keys. The code lives in `src/presentation/i18n`, because i18n is a presentation concern; `app/_layout.tsx` only mounts its provider.

| File                                 | Role                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `constants.ts`                       | `SUPPORTED_LANGUAGES`, `FALLBACK_LANGUAGE`, `DEFAULT_NAMESPACE`: the single source of truth         |
| `resources/en.ts`, `resources/fr.ts` | The translations, as TypeScript modules. `fr.ts` is typed against the shape of `en.ts`              |
| `resources/index.ts`                 | `RESOURCES`, typed over the supported languages, and `copyResources()`, a private copy per instance |
| `i18next.d.ts`                       | Types the keys through the `CustomTypeOptions` module augmentation (`strictKeyChecks`)              |
| `resolveLanguage.ts`                 | Pure function: device language tags in, supported language out                                      |
| `useDeviceLocale.ts`                 | Reads the device locales with `expo-localization`: the language shown, and the locale to format for |
| `localeTag.ts`                       | Pure function: the full tag of the device when it is in the language shown, the language otherwise  |
| `createI18n.ts`                      | Factory returning an initialised i18next instance with its own copy of the resources                |
| `translateCount.ts`                  | `translateCount(t, key, count, formatNumber)`: plural keys with a typed, formatted `count`          |
| `I18nProvider.tsx`                   | Creates the instance once and provides it, with the formatters, following the device                |
| `intlPluralRulesFallback.ts`         | `Intl.PluralRules` for the supported languages, installed only when the engine has none (Hermes)    |

Use a translation in a component:

```tsx
const { t } = useTranslation();
return <Text>{t('navigation.meetings')}</Text>;
```

### Typed keys

The keys are typed from the English resource. These fail `npm run typecheck`:

- `t('unknown.key')` and `t('navigation')` (a group of keys, not a translation);
- `t('unknown.key', 'Some text')` and `t('unknown.key', { defaultValue: 'Some text' })`. Without `strictKeyChecks: true` in `i18next.d.ts`, i18next switches the key check off as soon as a default text is given, which would let an untranslated text reach the screen;
- a French resource with a missing or an extra key, because `fr.ts` is typed `TranslationResource`, the shape of `en.ts`.

All of it is also asserted by tests (`@ts-expect-error` lines in `createI18n.test.ts`, `resources.test.ts` and `translateCount.test.ts`), so the guarantee cannot silently disappear. A lint rule rejects a literal default text on a valid key as well (see "What the linter enforces").

Keys are grouped by area (`navigation.meetings`, `errors.unauthorized`) in a single namespace. Add a text to `en.ts`, then to `fr.ts`: the typecheck fails until both exist. A key that no code uses is removed: `tooling/deadCode.test.ts` fails on it, as it does on a design token nothing uses.

The types check the parameters a text names (`t('meeting.pageCount', { count })` is refused without `formattedCount`), but not that a `count` is a number: a count that is a string (a route parameter, say) compiles and shows the raw key `meeting.pageCount` to the user. So a plural key is read through `translateCount`, which only accepts a plural key, a `count` that is a number and the number formatter of the locale, and writes the count with the grouping of the locale (`1,234 pages`, `1 234 pages`):

```tsx
const { t } = useTranslation();
const { number } = useFormatters();
return <Text>{translateCount(t, 'meeting.pageCount', document.pageCount, number)}</Text>;
```

### French typography and the French resource

French puts a no-break space (U+00A0) before a colon, a semicolon, a question mark and an exclamation mark, so that the sign never starts a line. `resources.test.ts` checks every French value for it. The same test fails when a French value is the English text left as it was, unless the key is in an explicit list of the words both languages write alike (`Documents`, `Public`, ...), and it pins the French text of the messages the user must not miss (the saved-data banner, the errors of the session).

### Adding a language

1. Add its code to `SUPPORTED_LANGUAGES`. The typecheck then asks for steps 2 and 3.
2. Create `resources/<code>.ts`, typed `TranslationResource`, and register it in `RESOURCES`.
3. Add its cardinal rule and its plural categories to `CARDINAL_RULES` and `CATEGORIES` in `intlPluralRulesFallback.ts`, with the same categories as the engine's own `Intl.PluralRules` (the parity test in `intlPluralRulesFallback.test.ts` compares them).
4. If the language has a plural category that `en.ts` does not list (French `many`, Russian `few`), add the matching `_<category>` entry to every plural key of `en.ts`: the other languages are typed against its shape.
5. Add the code to `SUPPORTED_LOCALES` in `app.config.ts`. `tooling/app-config.test.ts` fails if the two lists differ. The list is repeated there because Expo loads `app.config.ts` with plain Node.js module resolution, which cannot import the TypeScript constants of `src/`.

### Language detection

`resolveLanguage` takes the language tags of the device in the order of preference of the user (`['fr-CA', 'en-US']`) and returns the first supported language. The region is ignored (`fr-CA`, `fr-FR` and `fr-BE` are all `fr`, `en-GB` is `en`), the casing, the `_` or `-` separator and the whitespace around a tag are tolerated, and an unsupported or missing locale gives the fallback language. An entry that is not a string (`null`, `undefined`) is skipped instead of throwing, because the tags come from the native side. It is a pure function with unit tests; the only code that touches the device is the few lines of `useDeviceLocale`. The same hook picks the locale to format dates and numbers for (`pickLocaleTag`): the full tag of the device when it is in the language shown (`en-GB` gives day-month order and a 24 hour clock), the bare language otherwise (a forced language, or a device in a language the app does not have).

`I18nProvider` follows the language of the device while the app runs: `useLocales` re-renders it when the user changes the system language or the per-app language, and the provider switches the language of its instance. Its optional `language` prop forces a language, which is what the tests use and what a future in-app language setting would use.

### One explicit provider, no global instance

react-i18next offers two wirings: the global `initReactI18next` plugin on the `i18next` singleton, or an `I18nextProvider` given an instance. This project uses the second, with `createI18n()` as an instance factory over `createInstance()`:

- every call returns an independent instance with its own deep copy of the resources (`copyResources()`), so tests never share state and never reset or mock the library. i18next keeps and mutates the object it is given, so the shared `RESOURCES` object never reaches an instance: `addResource` on one instance changes nothing for the others, nor the `en` and `fr` modules (`createI18n.test.ts` checks it);
- nothing runs at import time;
- the dependency is explicit: a component gets its translations from the provider above it.

Initialisation is synchronous (`initAsync: false`, resources in memory), so the first render is already translated.

### Per-app language settings

`app.config.ts` declares the supported languages to the `expo-localization` config plugin (`supportedLocales`). Prebuild writes them to `CFBundleLocalizations` on iOS and to `res/xml/locales_config.xml` with `android:localeConfig` on Android, which makes the app appear with its languages in the per-app language settings of the system (iOS 13+, Android 13+). The plugin also lets the Android activity handle locale changes without a restart, which the provider relies on. Run `npx expo prebuild` after changing the list (the native folders are generated, never committed).

### Plurals on Hermes

i18next picks a plural form through the global `Intl.PluralRules`. Hermes does not implement it, and since i18next 24 there is no fallback: without it every language gets the English rule "`one` if the count is 1, `other` otherwise". That is wrong for French, where 0 is singular ("0 page"). The usual fix is the `intl-pluralrules` polyfill; it is not a dependency of this project, so `intlPluralRulesFallback.ts` provides the cardinal rules of the supported languages instead, and installs them only when the engine has no `Intl.PluralRules`.

`meeting.pageCount` is a pluralised key (`pageCount_one`, `pageCount_many`, `pageCount_other`), used by the document rows of the meeting detail. `plurals.test.ts` runs it in both languages, with the `Intl.PluralRules` of the engine and without it, and another test shows i18next alone getting French wrong. `intlPluralRulesFallback.test.ts` compares the fallback with the `Intl.PluralRules` of the engine for both languages, so that a count gets the same plural form on both.

Known limits, on purpose:

- Only cardinal plurals. Ordinals (`ordinal: true`) are not supported by the fallback.
- French has three categories: `one` (0 and 1), `many` (exact multiples of one million, "1000000 de pages") and `other`. An engine with its own `Intl.PluralRules` selects `many` for them, and so does the fallback. A plural key therefore needs the three entries in `fr.ts`, and, because the shape of every language comes from `en.ts`, a `_many` entry in `en.ts` too, which English never shows. Without it, i18next would silently render the English text in a French UI for those counts on an engine that has `Intl.PluralRules`.
- If the app later needs more languages or ordinals, the maintained polyfill (`intl-pluralrules`) is the better answer than extending the fallback.

## No magic strings

A string literal is acceptable only when the type system verifies it: a member of a union type (`accessibilityRole="header"`, `fontWeight: '700'`), a typed translation key (`t('navigation.meetings')`), a typed route. Anything else is a named constant with a single definition.

| Kind of value                                           | Where it lives                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| User-facing text                                        | `src/presentation/i18n/resources`, read with `t('...')`                                             |
| Languages and the namespace                             | `src/presentation/i18n/constants.ts`                                                                |
| Colours, spacing, font sizes                            | `src/presentation/theme/tokens.ts`, only the tokens in use                                          |
| Test IDs                                                | A constants module, referenced from the component and from its test                                 |
| Codes, roles, statuses, choices, event names (business) | `UPPER_SNAKE` const objects in `src/domain` and `src/application`, the union type derived from them |

### What the linter enforces

In `app/` and `src/presentation`, `npm run lint` fails on:

- a string literal as a JSX child: JSX text, `{'text'}`, a template literal, and text reached through a conditional, a logical expression, an array or a type assertion (`{ok ? 'Yes' : 'No'}`, `{ok && 'Yes'}`, `{['a', 'b']}`, `{'Yes' as string}`, `{'Yes'!}`), at any nesting up to eight levels. `react/jsx-no-literals` covers the first three, and `no-restricted-syntax` selectors complete it, because the rule does not see the others;
- a string literal in a prop that reads like a text, written `prop="text"`, `prop={'text'}`, as a template literal, a concatenation, a conditional or a type assertion. Props are recognised by name, not from a list: `title`, `label`, `hint`, `description`, `subtitle`, `message`, `text`, `caption`, `placeholder`, `badge`, `alt`, any camelCase name that ends with one of them (`accessibilityLabel`, `headerBackTitle`, `tabBarBadge`, `emptyText`), and the `aria-*` props that hold a text. `react/jsx-no-literals` can only flag all props or none, so `accessibilityRole="header"`, `resizeMode="cover"`, `keyboardType="numeric"` and `aria-live="polite"` stay free;
- text in the object props of an element (`options`, `screenOptions`, any `*Options`, `accessibilityValue`, `accessibilityActions`), in the keys that read like a text (`title`, `drawerLabel`, `tabBarAccessibilityLabel`, ...), whether the key is written `key`, `'key'` or `['key']`. Typed keys such as `presentation: 'modal'` or `tabBarLabelPosition: 'below-icon'` stay free;
- text passed to `Alert` (title, message and button `text`), `ToastAndroid` and `AccessibilityInfo.announceForAccessibility`, by position, so that a typed argument such as the `'plain-text'` input type of `Alert.prompt` stays free; text given to `Share.share(...)` and `navigation.setOptions(...)`;
- a default text in a call of `t`: `t('key', 'Some text')` and `t('key', { defaultValue: 'Some text' })`. The types reject an unknown key even then (see Typed keys), but a text next to a valid key is still a text that lives outside the resources;
- a raw `testID` or `nativeID` literal, or a prop that ends with `TestID`;
- a raw colour: a hex string or an `rgb(...)` style function anywhere, and any string given to a colour property (`color`, `backgroundColor`, `borderTopColor`, ...) of a style. A style is the `style` prop (and any `*Style` prop), the argument of `StyleSheet.create`, `flatten` and `compose`, and a value typed or `satisfies`-checked as `ViewStyle`, `TextStyle`, `ImageStyle` or `StyleProp`. `src/presentation/theme` is where colours are written; the translation resources, which are free text, are exempt from the colour rules too.

Colour props of a component (`<Badge color="primary" />`) are deliberately **not** checked by name: such a prop may take a union of token names, which the type system verifies, and a rule cannot tell it from `<ActivityIndicator color="red" />`. A hex or `rgb(...)` value is still rejected there, by its value.

The name patterns and the lists of calls are constants at the top of the UI section of `eslint.config.mjs`. `tooling/lint-rules.test.ts` checks, with the real configuration, what is rejected and what stays accepted, so a rule that stops working fails the suite.

### What it cannot catch

A selector reads the syntax in front of it; it does not follow a value.

- A text held in a variable or a constant and rendered with `{label}`: the convention and code review cover it.
- A text returned by a call or a callback: `{String('Hello')}`, `{items.map(() => 'Item')}`.
- Numbers. Spacing, sizes and other numeric values are tokens by convention only; a rule on numbers would flag `flex: 1` and `zIndex`.
- A text prop whose name does not read like a text (`<Banner heading="Hello" />`), a text given to `value` or `defaultValue` of an input, and a text passed through a spread (`{...props}`). Name the prop with one of the words above, or review.
- A named colour (`'red'`) outside a style: in a plain object that is only later used as a style, or in a colour prop of a component. Use a token.
- A value nested in more than eight conditionals, which no component needs.
- A `t` that has been renamed (`const { t: translate } = useTranslation()`) when a default text is given to it.

## Git hooks and commit convention

Hooks are installed by `npm install` through the `prepare` script (Husky), provided the directory is already a Git repository (see Getting started). On installs without development dependencies, `prepare` does nothing instead of failing.

- `pre-commit` runs lint-staged (`eslint --fix` and `prettier --write` on the staged files), then `npm run typecheck`.
- `commit-msg` is a POSIX shell script with no dependency. It rejects any message that does not follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope)!: subject`, where scope and `!` are optional. Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`. The messages that git creates itself are let through: merges (`Merge branch`, `Merge remote-tracking branch`, `Merge tag`, `Merge commit`, `Merge pull request`), reverts, and the `fixup!`, `squash!` and `amend!` commits used with `git rebase --autosquash`. Any other message starting with `Merge` is rejected.

## Planned sections

The headings below are placeholders. Each one will be written in a later step, together with the feature it describes.

## Architecture diagram

> Placeholder: to be written in a later step.

## Native module

> Placeholder: to be written in a later step.

## Testing strategy

> Placeholder: to be written in a later step.

## CI/CD

> Placeholder: to be written in a later step.

## Migration strategy

> Placeholder: to be written in a later step.

## Mobile security

> Placeholder: to be written in a later step.

## ADR index

> Placeholder: to be written in a later step.
