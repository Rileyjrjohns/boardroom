# Architecture

The code is organised **feature first**, and inside each feature **by layer** (hexagonal). Dependencies point inwards, toward the domain, and the dependencies between features are few, go one way and have no cycle: where two features need each other, the one that owns the rule declares a port (or a slot, or a context), the other implements it, and `src/composition` wires them. The rules are not a convention: they are checked by the linter on every commit (see [How the toolchain enforces it](#how-the-toolchain-enforces-it) and [ADR 0015](adr/0015-feature-first-hexagonal-architecture-with-links-inverted-through-the-composition.md)). The ports and the adapters that implement them are drawn in the [README](../README.md#ports-and-adapters), and every port is specified in [the shared spec](spec/ports.md).

The Flutter twin of this repository is organised the same way, with the same inversions under the same names (its own `docs/architecture.md` has the table for Dart); the differences are listed in its `docs/parity/open-questions.md`.

## The layout

```text
app/                       expo-router route files (thin)
src/
  core/                    the shared kernel: no rule of a feature
    domain/                  Result, ids, Instant, Page, AppError and its core families, the cache age
    application/             ports (Clock, Monitoring, Connectivity, SessionGate), the offline policy
    infrastructure/          HTTP client, persistence machinery, files, secure storage, clock, monitoring
    presentation/            theme, shared components, i18n, query client, the state and services they take
  features/
    auth/                    who the user is: the account, the session, the app lock
    meetings/                the meetings, their agenda, resolutions, participants and documents
    documents/               opening a document, the watermark, the screen protection
    votes/                   casting a vote, the outbox, synchronising it
      domain/  application/  infrastructure/  presentation/     the layers of every feature
  composition/             the composition: the only place that knows every feature
    container/               the composition root: configurations, ports wiring, use cases
    persistence/             the schema of the database of the whole file, and the history of its migrations
    device/                  the seams of the phone
    dev/                     the simulated world of the mock configuration (fixtures, mock API)
    shell/                   the app shell: navigation, providers, the plugs between features (UI)
    glue/                    the glue between features (pure): the lists and the objects that wire the ports, and the tests that need every feature
  testing/                 test support that serves several scopes (builders, fakes, render helpers)
```

`src/core`, each folder of `src/features` and `src/composition` have a `README.md`. `src/composition` is the composition of the application (the `lib/app` of the Flutter twin): the root `app/` folder is reserved to expo-router, so it cannot be called `app`. The test support next to the code it serves (`testing` folders) and the shared one (`src/testing`) follow one rule: only tests and other test support import them.

## The features

```mermaid
graph TD
  composition --> auth
  composition --> meetings
  composition --> documents
  composition --> votes
  composition --> core
  votes --> meetings
  votes --> auth
  votes --> core
  documents --> meetings
  documents --> auth
  documents --> core
  meetings --> auth
  meetings --> core
  auth --> core
```

An arrow is "may import". The graph is the constant `FEATURE_GRAPH` of `tooling/featureGraph.mjs`, which says why each edge exists and which the linter turns into dependency policies.

- **`core` imports no feature and not `composition`.** It holds what several features use and none owns. A rule of a feature does not go in `core` to dodge a cycle: the feature that owns it declares the port it needs.
- **A feature imports `core` and the features the graph names for it, by their `domain`, their `application` and their `presentation`.** Never their `infrastructure`: an adapter is chosen by the composition, and reached through a port.
- **A feature never imports `composition`.** `composition` imports everything (through the rules of its own layers), and `app/` mounts it.
- **There is no cycle** between features. The linter configuration is built from the graph, and fails to load when the graph has a cycle, names something that is no feature or names a feature for itself.
- **Tests and test support** are held to the rules of the layers (a test of the domain imports no application) and may import the feature they need to set the scene; the graph is for the production code. Pure-node Jest projects stay free of any framework.

## Inversions

When a feature needs something of one that the graph does not allow it to import, the dependency is inverted: **the feature that owns the policy declares the port (or the slot, or the context) it needs, another feature implements it, and only `src/composition` assembles them.** A feature added later joins a list without the owner changing.

| Owner      | Port, slot or context it declares                                                                                                                                                                                             | Who implements it                                                                                                                                                                    | Where it is wired                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`     | `SessionDataPurger` (`features/auth/application/ports`): the data a session leaves on the device, purged when the session ends. The rule "nothing a user saw stays on the device" is `auth`'s, what each feature keeps is not | `meetings` (`MeetingCachePurger`), `documents` (`DocumentCachePurger`)                                                                                                               | `composition/glue/sessionDataPurgers.ts` makes the ordered list (the meetings, then the documents) that `purgeCaches` runs                 |
| `core`     | `SessionGate` and `SessionRefusal` (`core/application/ports`): what the offline policy (`loadWithCacheFallback`) asks of the session: who is signed in, end a session the server refused, purge                               | `auth` (`AuthSessionGate`, over `requireSameUser`, `endRefusedSession` and `purgeCaches`)                                                                                            | The deps of the use cases that load data carry it (`sessionGate`); `wireUseCases` builds it from the session guard of `auth`               |
| `votes`    | `RecordedVoteSink` (`features/votes/application/ports`): write a vote the server recorded into the local copy of its meeting                                                                                                  | `composition/glue/MeetingCacheVoteRecorder.ts` (the cache of `meetings`, `withVoteRecorded` of `votes`, the session guard of `auth`)                                                 | The deps of `CastVote` and `SyncPendingVotes` carry it (`recordedVoteSink`)                                                                |
| `meetings` | `MeetingDocumentEvictor` (`features/meetings/application/ports`): drop the documents of a meeting the server refuses                                                                                                          | `documents` (`DocumentCacheEvictor`)                                                                                                                                                 | The deps of `loadMeeting` carry it (`documentEvictor`)                                                                                     |
| `core`     | The retryable codes: `coreRetryableCodes` (`core/application/retryableCodes.ts`). A feature has codes of its own; `documents` declares `documentsRetryableCodes`                                                              | `documents` (`documentsRetryableCodes`)                                                                                                                                              | `composition/glue/retryableCodes.ts` assembles `RETRYABLE_CODES`, the set of the specification; the shell hands it to the screens (below)  |
| `core`     | `AppError` (`core/domain/errors`): an open base, `{ code }`. The core keeps its families (repository, storage, validation)                                                                                                    | Each feature declares its own family: `AuthenticationError` and `BiometricError` in `auth`, `VotingError` and `VoteDeliveryError` in `votes`, `ScreenProtectionError` in `documents` | `composition/glue/errorCodes.test.ts` is the one place that sees them all, and checks that their codes never collide                       |
| `core`     | `Migration` and the machinery of the encrypted database (`core/infrastructure/persistence`): it knows no table, the list of migrations is handed to it                                                                        | Each feature owns the names of its tables, columns and indexes (`infrastructure/persistence/schema.ts`) and its adapter reads only its own                                           | `composition/persistence/migrations.ts` is the history of the whole file, `schema.ts` its tables and indexes                               |
| `meetings` | `ResolutionActionsSlot` (`features/meetings/presentation/slots`): what to show under a resolution, and at the top of a meeting                                                                                                | `votes` (`VOTE_RESOLUTION_ACTIONS`: the line about the vote of the user, the choices, the failure to read the votes)                                                                 | `AppProviders` (`composition/shell/services`) plugs it with `ResolutionActionsProvider`                                                    |
| `core`     | `BannerNotices` (`core/presentation/components/StatusBanner`): lines a feature adds to the one banner area of the screens                                                                                                     | `votes` (`SYNC_SUMMARY_NOTICES`: what the last synchronisation did)                                                                                                                  | `AppProviders` plugs it with `BannerNoticesProvider`                                                                                       |
| `core`     | `ErrorCatalog` (`core/presentation/errors`): which codes a screen has a text for, which a retry can fix; `isSessionEndingCode` and the epoch of the access, taken by the query client and by `useResultMutation`              | `auth` (the texts and the codes of the session: `SESSION_ERROR_KEYS`, `isSessionEndingCode`, the epoch of the access store), `documents` (its retryable code)                        | `composition/shell/errorCatalog.ts` assembles the catalog; `createAppState` and `AppProviders` hand it to the query client and the screens |
| `core`     | `CoreServices` (`core/presentation/services`): the controls of the demo and the notices of the start                                                                                                                          | The composition root (`demoControls`, `notices`)                                                                                                                                     | `AppProviders` provides it from the `AppServices` it receives                                                                              |

The first five are the inversions that remove the edges of the first feature-first layout and are the same, under the same names, in the Flutter twin; the other rows are the same idea for what a type system with no sealed union, a database schema and a user interface add. A port declared like this is specific to the application: the specification (`docs/spec`) does not know it, and the conformance test lists it (`INVERSION_PORTS` in `tooling/spec.test.ts`).

### In the presentation

The shell used to hold the state and the services that the features and the shared components read. They are split by owner, and the features never import the composition:

- **State.** Where the user stands (`access`, `accessEpoch`, `sessionEndedBy`, the transitions, `useSessionOpen`) is `auth`'s: `features/auth/presentation/state`. The state that belongs to no feature (the connection, the privacy cover, the notice of a reset of the local data) is the core's: `core/presentation/state/uiStore.tsx`. The period of the meetings list is the meetings' (`meetingsStore`), and the summary of the synchronisations is the votes' (`voteSyncStore`, which follows the access store it is given and forgets the summary when the epoch of the access moves). One Zustand store per owner, created per app instance by `createAppState` and provided through context.
- **Use cases.** Each feature declares, in `presentation/services`, the use cases its screens and hooks take (`MeetingsServices` and its relatives) and a provider; `composition/shell/services/AppServices.tsx` is the aggregate the composition root hands over, which `AppProviders` fans out into those contexts.
- **Shared components.** `Dialog`, `StatusBanner`, `DemoControls`, `ErrorState` and `useResultMutation` read the core's store and services, a context the core declares for what is not the core's (the catalog of errors, the epoch of the access, the notices of the banner), and props. The composition provides them.
- **Messages, test ids, query keys.** Each feature declares its own (`presentation/i18n/*MessageKeys.ts`, `presentation/testIds.ts`, `presentation/query/*QueryKeys.ts`); the core keeps the generic machinery (the typed `t`, the query client, `CORE_TEST_IDS`). `composition/shell/testIds.ts` assembles `TEST_IDS`, the registry the specification is compared with.

## Layers and the dependency rule

The layers below are the same in the core and in every feature: the folder `domain` of `src/core` and of each feature is the layer `domain`, and so on.

```mermaid
flowchart TD
    app["<b>app/</b><br/>expo-router route files"]
    presentation["<b>presentation</b><br/>screens, hooks, TanStack Query, Zustand, i18n, theme"]
    container["<b>container</b><br/>composition root: two configurations, mock and http"]
    infrastructure["<b>infrastructure</b><br/>adapters: HTTP, SQLite, secure storage, device, in-memory"]
    application["<b>application</b><br/>use cases and ports"]
    domain["<b>domain</b><br/>entities, value objects, policies, errors, Result"]

    app --> presentation
    app --> container
    presentation --> application
    presentation --> domain
    container --> infrastructure
    container --> application
    container --> domain
    infrastructure --> application
    infrastructure --> domain
    application --> domain
```

An arrow is an allowed import. `domain` imports nothing. `application` declares the ports (the interfaces to the outside world: repositories, caches, the outbox, the biometric gate, the clock, the screen protection) and `infrastructure` implements them, which is why the arrow points from the adapters to the ports and never the other way: a use case does not know that an adapter exists. `presentation` never imports `infrastructure` or `container`: it declares the shape of the services it needs and receives them from the root layout. `container` is the one place where ports meet adapters.

| Folder                                                                        | Role                                                                                                                | May import                                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `app/`                                                                        | expo-router route files. Thin: they mount screens. The root layout builds the composition root                      | `presentation`, `container`, `assets/`, external modules (not TanStack Query nor Zustand)                   |
| `domain` (`src/core/domain`, `src/features/*/domain`)                         | Entities, value objects, business rules, business errors                                                            | `domain`. No external module at all                                                                         |
| `application` (`src/core/application`, `src/features/*/application`)          | Use cases and ports (interfaces)                                                                                    | `domain`, `application`. No external module at all                                                          |
| `infrastructure` (`src/core/infrastructure`, `src/features/*/infrastructure`) | Adapters implementing the ports: HTTP, SQLite, secure storage, device, in-memory caches                             | `domain`, `application`, `infrastructure`, external modules (not TanStack Query nor Zustand)                |
| `presentation` (`src/core/presentation`, `src/features/*/presentation`)       | Screens, components, hooks, i18n, theme tokens                                                                      | `domain`, `application`, `presentation`, `assets/`, external modules. Never `infrastructure` or `container` |
| `src/composition/container`                                                   | The single composition root that wires ports to adapters with manual typed injection                                | `domain`, `application`, `infrastructure`, `container`. No external module at all. Never `presentation`     |
| `src/composition/dev`, `device`, `persistence`                                | The simulated server of the mock configuration, the seams of the phone, the history and the schema of the database  | The rules of `infrastructure`                                                                               |
| `src/composition/shell`                                                       | The app shell: navigation, providers, the plugs between features                                                    | The rules of `presentation`                                                                                 |
| `src/composition/glue`, `src/testing/*`                                       | The glue between features (pure) and the tests that need every feature, and test support that serves several scopes | The rules of the layer they stand for (`application` for the glue)                                          |

On top of the layers, the production code is held to the graph of the features ([The features](#the-features)): the element of a file is its layer and its scope (`core`, `feature`, `composition`, `testing`), and the scope of a feature carries the capture group `feature`, its name, which the policies read.

Three extra rules: the `zod` package and the native modules of the device (`expo-sqlite`, `expo-secure-store`, `expo-crypto`, `expo-file-system`, `expo-local-authentication`, `expo-network`) may only be imported from an infrastructure folder (`expo-file-system` from one file of it, `src/core/infrastructure/files/ExpoFileVolume.ts`, and `react-native-pdf` from one component of the presentation, `src/features/documents/presentation/components/PdfViewer.tsx`), `@tanstack/react-query` and `zustand` (server state and interface state) may only be imported from a presentation folder, the Sentry SDK (`@sentry/*`) from one file, the adapter of the `Monitoring` port (`src/core/infrastructure/monitoring/SentryMonitoring.ts`), and `fetch` is called by one module, the HTTP client (`src/core/infrastructure/http/HttpClient.ts`). The local native module `modules/screen-protection` is imported by `src/features/documents/infrastructure/native` alone, with one exception, its secure view (see [The secure view](native-module.md#the-secure-view)).

Everything else in the repository (`package.json`, the configs, `tooling/`, scripts) is tooling. Code under `app/` and `src/` cannot import it.

Path aliases map to the matching `src` folder: `@core/*`, `@features/*`, `@composition/*` and `@testing/*`. They resolve in TypeScript, Metro, Jest and ESLint. A file imports another of its own layer (in the same scope) by a relative path, and anything else by an alias.

## One use case, end to end: casting a vote offline, then synced

The diagram follows one vote through the layers in the `http` configuration. A participant is a port (an interface of the application layer) with the adapter that implements it under its name. In the `mock` configuration the adapters are the `InMemory*` ones and nothing above the ports changes.

```mermaid
sequenceDiagram
    autonumber
    actor M as Member
    box Presentation
        participant UI as Screen and hooks<br/>(useCastVote, useVoteSync)
    end
    box Application
        participant CV as CastVote
        participant SP as SyncPendingVotes
    end
    box Ports, and the adapters behind them
        participant MR as MeetingRepository<br/>HttpMeetingRepository
        participant MC as MeetingCache<br/>SqliteMeetingCache
        participant BG as BiometricGate<br/>DeviceBiometricGate
        participant VR as VoteRepository<br/>HttpVoteRepository
        participant OB as VoteOutbox<br/>SqliteVoteOutbox
    end

    Note over M,OB: The device is offline
    M->>UI: choose "For", confirm
    UI->>CV: execute(meetingId, resolutionId, choice)
    CV->>MR: get the meeting (offline policy: remote first)
    MR-->>CV: networkUnavailable
    CV->>MC: read the saved copy
    MC-->>CV: the meeting, flagged stale and dated
    CV->>OB: findByResolution(resolutionId, voterId)
    OB-->>CV: no vote waiting for this resolution
    CV->>CV: checkVotingEligibility (domain policy)
    CV->>BG: confirm the vote with the biometrics
    BG-->>CV: ok
    CV->>CV: same user still signed in, app still unlocked?
    CV->>VR: submit(vote, idempotency key)
    VR-->>CV: networkUnavailable
    CV->>OB: enqueue(pending vote)
    OB-->>CV: enqueued
    CV-->>UI: ok, status "queued"
    UI-->>M: "Your vote is saved on this device"

    Note over M,OB: The connection comes back
    Note over UI: ObserveConnectivity reports online
    UI->>SP: execute()
    SP->>OB: list(voterId)
    OB-->>SP: pending votes, oldest first
    loop for each pending vote
        SP->>SP: same user still signed in, app unlocked?
        SP->>VR: submit(vote, same idempotency key)
        VR-->>SP: ok
        SP->>OB: remove(key)
    end
    SP-->>UI: report, one vote synced
    UI-->>M: "1 vote was sent"
```

What to read in it:

- **The screen knows use cases, not adapters.** `useCastVote` is a TanStack mutation that awaits `CastVote` and unwraps its `Result`. The business answer (`queued` or `submitted`) is a value, and the screen translates it into a message.
- **The policy is in the application layer.** The fallback to the saved copy only when the network is unavailable, the eligibility check (a pure function of the domain), the second check that the same user is still there after the biometric prompt, the queueing: all of it is in `CastVote` and `loadWithCacheFallback`, testable with fakes and no device.
- **A queued vote is safe to send more than once.** The idempotency key is built from the resolution and the voter, and the server records the vote once. A business rejection on the replay (the resolution closed in between) moves the vote to `rejected` with its reason, kept until the user has seen it. After five unexpected failures the vote is given up and shown.
- **The application does not watch the network.** The presentation hears the connection come back (and the app return to the foreground, and a sign-in or an unlock) and asks for a run of `SyncPendingVotes`. That is the one place that decides when to sync (`useVoteSync`).
- **Online, the short path is the same code.** The submission succeeds at once, the vote is recorded on the cached meeting too, and the outbox is not touched.
- **See [ADR 0005](adr/0005-offline-first-with-a-sqlite-outbox.md)** for why the outbox and the offline policy are built this way, and [Domain and application](design-in-depth.md#domain-and-application) for the whole policy.

## How the toolchain enforces it

- **ESLint, with `eslint-plugin-boundaries`** (`eslint.config.mjs`): every file under `app/` and `src/` belongs to a layer and to a scope, a layer may only import the layers it is allowed to, and the production code of a feature may only import the features the graph names for it (`FEATURE_GRAPH`), never the infrastructure of another feature, never the composition; the core imports no feature and not the composition. Imports of external packages are checked too: `domain`, `application` and `container` import none; `zod` and the native modules of the device only `infrastructure`; TanStack Query and Zustand only `presentation`; the local native module only `src/features/documents/infrastructure/native` (and its secure view, one presentation component); the Sentry SDK only its adapter; `fetch` only the HTTP client. Production code cannot import a `testing` folder.
- **Purity of the inner layers.** In `domain` and `application`, `throw` is forbidden (every failure is an error `Result`), so is every read of the system clock (time comes from the `Clock` port), and so are the ambient globals that reach the runtime (`process`, `window`, `fetch`, timers, `console`).
- **TypeScript at its strictest.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `checkJs` for the JS configs. Translation keys, the maps from error codes to texts, and (once the dev server has run) the routes are typed.
- **No magic strings.** Lint rejects text, colours and test ids written inline in the UI code; they are translations, theme tokens and constants (see [No magic strings](conventions.md#no-magic-strings)).
- **Tests of the rules themselves.** The Jest project `tooling` lints snippets with the real configuration, so a rule that stops working fails a test, and checks the repository's own invariants: aliases, environment reads, routes, the app config, the commit hook. The Jest project `core` runs `domain` and `application` in plain Node, with no React Native or Expo setup, behind a 90 percent coverage gate.
- **Git hooks and scripts.** The pre-commit hook runs lint-staged (ESLint and Prettier on the staged files) and the typecheck, the commit-msg hook enforces Conventional Commits, and `npm run validate` runs lint, typecheck, format check and the tests with coverage, and `npm run lint:architecture` runs the boundary rules alone. How the pipeline runs them is in [CI/CD](ci-cd.md#cicd).

The complete list of rules is in [How the rule is enforced](#how-the-rule-is-enforced), and what a lint rule cannot catch is stated there and under [No magic strings](conventions.md#no-magic-strings).

## How the rule is enforced

- `eslint.config.mjs` classifies the files under `app/`, `src/` and `assets/` into the elements above with eslint-plugin-boundaries, and declares which element may depend on which.
- Each folder of a layer is two elements over the same folder: its layer (`domain`, `application`...) and its scope (`core`, `feature`, `composition`, `testing`), and the folders of a feature capture its name (`src/features/*/domain` has the capture group `feature`). The policies of the layers read the first, the policies of the graph read the second and the name.
- The policies of the graph are made from `FEATURE_GRAPH` (`tooling/featureGraph.mjs`, one reason for each edge) by `featureGraphPolicies`: for each feature, a `disallow` towards every feature that is not itself or one it names, and a `disallow` towards the infrastructure of any other feature; then the core towards the features and the composition, and the features towards the composition. They come after the policies of the layers, which a later policy wins over, and in a block of their own that excludes the tests and the test support (the options of a rule are replaced, not merged, so that block carries every policy).
- `featureGraphPolicies` throws, and so the linter fails to load, when the graph names something that is no feature, a feature for itself, or has a cycle. `tooling/featureGraph.test.ts` checks that the declared graph lists every folder of `src/features`, has no cycle and is the graph of this document; `tooling/lint-rules.test.ts` checks the rules both ways, for every pair of features and every layer: an import along an edge passes, one against the graph fails with a message that points at it, the infrastructure of another feature fails along an edge or not, the core and the features towards the composition fail, the composition sees every feature, a test is not held to the graph, and a fabricated cycle is refused.
- The plugin sees every file of the repository, dot files and dot folders included. A file under `app/` or `src/` that does not belong to any layer is an error (`boundaries/no-unknown-files`), and so is an import of any file that is not an app, layer or asset file, such as a script, a config, `package.json` or a test helper (`boundaries/no-unknown-dependencies`). Only `app/` and `presentation` may import `assets/`.
- Imports of external modules and Node.js core modules are checked too, which is what keeps `domain` and `application` free of any framework.
- A layer alias that does not resolve to a file is rejected instead of being mistaken for an external package. Aliases are resolved from an absolute tsconfig path, so ESLint gives the same result from any working directory.
- Type-only imports are checked like any other import, and so are `import('x')` types, `typeof import('x')`, `import x = require('x')`, `jest.mock` and the other Jest module calls, and `require.resolve`.
- `import()`, `require()`, the Jest module calls and `require.resolve` only accept a string literal under `app/` and `src/`, because a specifier built at runtime cannot be checked (`no-restricted-syntax`). `/// <reference path="..." />` is rejected as well.
- Packages are imported by name, never through a path in `node_modules` (`no-restricted-imports`), and every imported package must be declared in `package.json`, development dependencies being reserved to tests, test support (the `testing` folders, which hold the render helper of the screens) and tooling (`import/no-extraneous-dependencies`). `zod` is a dependency, and only the infrastructure folders may import it.
- The `domain` and `application` folders cannot use the ambient globals that reach the runtime environment: `process`, `window`, `document`, `fetch`, `localStorage`, timers, `console` and similar (`no-restricted-globals`). Their tests are exempt.
- In the production code of the `domain` and `application` folders, `throw` is forbidden (every failure is an error `Result`) and so is every read of the system clock: `Date.now()`, `new Date()` without an argument, `Date()` called as a function, and `performance.now()` (time comes from the `Clock` port). `new Date(millis)` stays allowed, it is a conversion (`no-restricted-syntax`). Tests and the `testing` folders are exempt.
- Production code cannot import from a `testing` folder, whether through a relative path or an alias, a type import or a re-export (`no-restricted-imports`). Tests and other test support can. A dynamic `import()` or a `require` of a `testing` folder is not detected by this rule.
- `no-restricted-syntax` and `no-restricted-imports` apply to a set of files as a whole: in a flat config a later block replaces the options of an earlier one instead of merging them. `eslint.config.mjs` builds the options of each block with `restrictSyntax` and `restrictImports`, which always carry the restrictions that apply to every file (the computed module specifiers), and `tooling/lint-rules.test.ts` checks that none is lost for any set of files.
- `@tanstack/**` and `zustand` (and their subpaths) are rejected outside the presentation folders, by a dependency policy with its own message (`tooling/lint-rules.test.ts` checks it for every layer and for the route files).
- `expo-sqlite`, `expo-secure-store`, `expo-crypto`, `expo-local-authentication` and `expo-network` (and their subpaths) are rejected outside the infrastructure folders, by a dependency policy of the same kind: the other layers reach the device through a port. `expo-file-system` is further limited to one file, `src/core/infrastructure/files/ExpoFileVolume.ts`, and `react-native-pdf` to one component, `src/features/documents/presentation/components/PdfViewer.tsx`, by a `no-restricted-imports` pattern each (`tooling/lint-rules.test.ts` checks both, and that each exempt file keeps the other restrictions).
- The local native module `modules/screen-protection` is rejected everywhere but `src/features/documents/infrastructure/native`: a dependency policy refuses it to every other layer, and a restricted-imports pattern keeps the rest of the infrastructure, tests and test support included, out of it. The one exception is `src/features/documents/presentation/components/SecureContent.tsx`, which may import the secure view from the entry point and nothing else of the module (`tooling/lint-rules.test.ts` checks both sides).
- `fetch` is called by one module, `src/core/infrastructure/http/HttpClient.ts`: the bare global is rejected everywhere else in `app/` and `src/` (tests and test support excepted), and the forms that get round the rule (`globalThis.fetch`, `global.fetch`, `window.fetch`, `self.fetch`) are rejected everywhere, the client included.
- The Sentry SDK (`@sentry/**`) is imported by one file, `src/core/infrastructure/monitoring/SentryMonitoring.ts`, the adapter of the `Monitoring` port: a dependency policy refuses it to the other layers, and a restricted-imports pattern keeps the rest of the infrastructure, tests and test support included, out of it.
- `.mts` and `.cts` files are linted with the TypeScript parser like `.ts` files.

Known limit: an aliased `require` (`const r = require; r('x')`) cannot be detected by a lint rule.

## Composition root

`src/composition/container` is the one place where ports meet adapters, by manual, typed constructor injection: no container library, no lookup by name, no module-level instance. It imports no external module: the device adapters are built in `src/composition/device` (`createExpoPlatform`), and the container only calls them.

| File                              | Role                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`                       | The configuration values, each with a one-line reason: the maximum age of a cache entry, the number of delivery attempts, the app lock grace period, the page size, the simulated latency and session lifetime, the request timeout, the passcode fallback of the biometrics |
| `adapters.ts`, `configuration.ts` | The two configurations as a discriminated union (`mock`, `http`), and the parsing and validation of every setting, in one place (`parseConfiguration`)                                                                                                                       |
| `errors.ts`                       | Why a container cannot be built: one code for each invalid setting, for the storage, for a native module that fails, for the seed                                                                                                                                            |
| `Ports.ts`                        | An adapter for every port, and the configuration values the use cases take                                                                                                                                                                                                   |
| `mockPorts.ts`                    | The adapters of the mock configuration, wired to each other                                                                                                                                                                                                                  |
| `httpPorts.ts`                    | The adapters of the http configuration, wired to each other: the client, the session storage, the encrypted database, the biometrics, the connectivity                                                                                                                       |
| `createMonitoring.ts`             | The monitoring of the container: `SentryMonitoring` when the build has an address, `ConsoleMonitoring` otherwise, and the console again when the address is bad or the SDK does not start                                                                                    |
| `wireUseCases.ts`                 | Builds the use cases from the ports, and the links between features (the purgers, the session gate, the document evictor, the recorder of a vote: see [Inversions](#inversions)). The same for every configuration                                                           |
| `ContainerRuntime.ts`             | What the container reads from outside: the clock, the monitoring, the Sentry SDK (a stand-in in the tests), the sleep, the device, and the text of the biometric prompt                                                                                                      |
| `createContainer.ts`              | `createContainer(config, runtime)` and `startContainer(settings, environment, runtime)`: the container, or an error                                                                                                                                                          |

**Starting is asynchronous, and can fail.** `createContainer` returns `Promise<Result<Container, ContainerError>>`: the http configuration opens its database, which reads the key from the keychain, opens a file and migrates the schema, and none of it may throw or be skipped. The mock configuration is built the same way, with nothing to wait for. A failure is an error to show (`storageUnavailable` with its reason, among others), never an exception and never the other configuration. `createContainer` never rejects: a native module of the device that fails to load or to start, or anything else the construction throws, is `platformUnavailable`, an error with a code of its own whatever was thrown (what it said is not kept). The root layout stays thin: it hands `startContainer` to `StartupGate` (presentation), which shows a translated loading state, then the screens inside `AppProviders`, or `StartupFailureScreen` with the technical code.

The container holds the use cases, the settings the screens need (`meetingsPageSize`), the clock the use cases read (`clock`: the one instant the presentation records itself, the moment the app goes to the background, is read from it so that `EvaluateAppLock` compares two instants of the same clock) the notices the user is owed at the start (`notices`: for now, that local data was reset, see [Persistence](design-in-depth.md#persistence)) and, in the mock configuration only, the demo controls (`demoControls`: the simulated network, off and on, and the accounts of the simulation). Each feature declares the shape its presentation needs (`MeetingsServices` and its relatives) and the shell aggregates them (`AppServices`: the use cases, the settings, the clock, and optional `demoControls` and `notices`). Stateful objects are single shared instances, built once per container: `ScreenProtectionCoordinator` (shared by `OpenDocument` and `CloseDocument`), `CastVote` and `SyncPendingVotes` (their guards live in the instance). `ContainerRuntime` replaces the clock, the monitoring and the sleep for a test, and hands the container the device (`platform`: the engine of the database, the secure storage, the secure random generator, the biometrics, the state of the network and, when the build has it, the native module that protects the screen; the real one is `createExpoPlatform`, whose wrappers import their native modules like any other import: they are loaded with the app, and in Jest the "infra" project gives each of the six Expo modules it wraps and the local ScreenProtection module an empty module (`NATIVE_MODULES` in `jest.config.js`), so that the platform factory and the composition root are imported as the app imports them and nothing native is loaded; the tests of the wrappers keep a stand-in of their own, each with its reason) and the text of the biometric prompt (required: only the layout can read the translations).

The two configurations differ as follows.

| Port              | `mock`                                                                                                | `http`                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Remote            | `InMemory*Repository` over the simulated server                                                       | `Http*Repository` and `HttpAuthSession` over `HttpClient`                                                 |
| Session           | In memory, in the simulated accounts                                                                  | `SessionVault` in the secure storage                                                                      |
| Meeting cache     | In memory                                                                                             | SQLite, encrypted                                                                                         |
| Vote outbox       | In memory                                                                                             | SQLite, encrypted                                                                                         |
| Document cache    | In memory, and files for the content                                                                  | SQLite (encrypted) for the metadata, and files for the content                                            |
| Biometrics        | `InMemoryBiometricGate`: always available, always recognises the user                                 | `DeviceBiometricGate` over `expo-local-authentication`                                                    |
| Connectivity      | `SimulatedConnectivity` over the simulated network                                                    | `ExpoConnectivity` over `expo-network`                                                                    |
| Screen protection | `NativeScreenProtection` over the local module, or `InMemoryScreenProtection` when the build has none | `NativeScreenProtection` over the local module (a build without it answers `screenProtectionUnsupported`) |

The mock configuration carries what varies between demos, each with its default in `config.ts`: whether the demo user is signed in at start (in which case the app starts unlocked, as after a sign-in; otherwise it starts locked, as after a cold start; the default is **signed out**, and only a test asks for the other), the latency of the server and the lifetime of its sessions. The http configuration carries the address of the API, the request timeout and the passcode fallback. **Every setting is validated in one place, `parseConfiguration`, and an invalid one is a start error with a code of its own:** `missingApiBaseUrl`, `invalidApiBaseUrl` (not an `http` or `https` URL of a host, or one with credentials, a query or a fragment), `insecureApiBaseUrl` (`http` outside a development build for a host that is not this machine), `invalidRequestTimeout` (not a whole number of milliseconds from 1 to 60 seconds) and `invalidBiometricFallback` (not a yes or a no). The wiring of the ports reads them from the configuration and imports none of them. The one setting that is not validated there is the address of the crash reporter: `createMonitoring` checks it and falls back on the console, since monitoring must not decide whether the app starts.

**Where the environment is read.** The settings are `EXPO_PUBLIC_BOARDROOM_ADAPTERS`, `EXPO_PUBLIC_BOARDROOM_API_BASE_URL` and `EXPO_PUBLIC_SENTRY_DSN` (the address of the crash reporter, optional), and they are read once each, in `app/_layout.tsx`, and nowhere else: Metro replaces the exact expression `process.env.EXPO_PUBLIC_...` with its value when it bundles, `domain`, `application` and `container` take no external input (`container` imports no external module), and the layout is the entry point that starts the container. The raw values go to `startContainer` together with whether this is a development build (the layout reads `__DEV__`; the container reads no global), which parses and validates them: a missing or empty adapters value means `mock` in a development build and is the error `missingAdaptersSetting` in any other, so that a release build never starts on the simulated server because a variable was forgotten; anything unknown is `invalidAdaptersSetting`. When the container cannot be built, the layout shows `StartupFailureScreen` with the technical code, instead of the app. `tooling/environment.test.ts` fails if a second place reads the environment, or if a variable is missing from `.env.example`.

## Tech stack

| Area          | Choice                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | Expo SDK 57, React Native 0.86, React 19 (New Architecture, always on from SDK 55)                                                                                                                                                                            |
| Server state  | TanStack Query 5: the query cache, pagination, pull to refresh, retries (see [Server state and UI state](design-in-depth.md#server-state-and-ui-state))                                                                                                       |
| UI state      | Zustand 5: the few pieces of interface state that must survive navigation                                                                                                                                                                                     |
| Navigation    | expo-router (file-based, typed routes, protected screens), custom scheme `boardroom`                                                                                                                                                                          |
| Native builds | expo-dev-client with Continuous Native Generation (`ios/` and `android/` are git-ignored), a local config plugin for the iOS scene life cycle, a local Expo module (`modules/`)                                                                               |
| i18n          | i18next, react-i18next, expo-localization: English and French, English as the fallback, typed keys (see [Internationalisation](conventions.md#internationalisation))                                                                                          |
| Language      | TypeScript, strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; the JS config files are type-checked too (`checkJs`)                                                                                                                    |
| Lint          | ESLint 9 flat config, eslint-config-expo, eslint-plugin-boundaries, eslint-config-prettier, no-magic-string rules for the UI code                                                                                                                             |
| Formatting    | Prettier                                                                                                                                                                                                                                                      |
| Persistence   | expo-sqlite built with SQLCipher (the caches of meetings and of documents, and the outbox of votes), expo-secure-store (the session and the key of the database), expo-crypto (the random bytes of that key), expo-file-system (the content of the documents) |
| Documents     | react-native-pdf draws a PDF from a file of the device (its peer, react-native-blob-util, is installed with it); a tiny PDF writer gives the demo documents their content                                                                                     |
| HTTP          | The global `fetch` behind one small client, zod for the schemas of the answers, a documented API ([`api.md`](api.md))                                                                                                                                         |
| Device        | expo-local-authentication (biometrics), expo-network (connectivity), the local module ScreenProtection (screen protection)                                                                                                                                    |
| Unit tests    | Jest 29 with four projects (`core`, `infra`, `ui`, `tooling`), jest-expo and React Native Testing Library for the screens, MSW and `node:sqlite` for the adapters                                                                                             |
| End-to-end    | Maestro flows (see [Testing strategy](testing.md#testing-strategy))                                                                                                                                                                                           |
| Delivery      | EAS Build, Submit and Update (`expo-updates`) driven by GitHub Actions, Sentry for crash reports, Fastlane as the alternative: see [CI/CD](ci-cd.md#cicd)                                                                                                     |
| Git hooks     | Husky, lint-staged, a Conventional Commits check written in plain shell                                                                                                                                                                                       |

## Folder layout

```text
app/                      expo-router routes (_layout.tsx, index.tsx, meetings/[meetingId].tsx, documents/[documentId].tsx, pending-votes.tsx, sign-in.tsx, lock.tsx) and +native-intent.tsx, which is not a route
docs/                     the documentation (README.md is its index) and api.md, the contract between the HTTP adapters and the server
  adr/                    the architecture decision records and their index
  spec/                   the shared specification (domain, ports, use cases, screens) and the fixtures of the demo data
locales/                  fr.json: the Info.plist strings of the iOS project in French (Face ID text)
src/
  core/                   the shared kernel (README.md): what every feature uses and none owns
    domain/                 shared (Result, Brand, constants, validation), errors (AppError, repository, storage, validation), value-objects (ids, Instant, Duration, Page), policies/cacheAge
    application/            ports (Clock, Monitoring, Connectivity, SessionGate, types/), offline/ (the offline policy), retryableCodes (the codes of the core), use-cases/ObserveConnectivity
    infrastructure/
      http/                 the client, the constants of the API, the gateway errors, the checks of an answer, dto/wire
      persistence/          the SQL seam, the openers, the unlocking of the encrypted database, its key and generations, the record of a reset, the migration runner (it knows no table: the migrations are handed to it)
      files/                the FileStore seam over a volume of files, and the volume of a device (expo-file-system)
      secure-storage/       the key-value seam over the keychain
      connectivity/         the connectivity over the device (expo-network)
      clock/                SystemClock, the sleep behind the simulated latency
      monitoring/           ConsoleMonitoring, and SentryMonitoring (the one file that imports the Sentry SDK)
      shared/               copies, results, the bounded-time wrapper, the queue that runs jobs in order, the listeners of an adapter, the paths of a flawed payload
      testing/              the Node SQLite engine, files and secure storage, doubles of the device (test support)
    presentation/           the shared interface
      components/           buttons, dialogs, states, banners, fields (the demo switch included)
      errors/               the catalog of errors: which codes a screen has a text for, which a retry can fix
      i18n/                 translations, language detection, provider, the typed `t`, the texts of the core's own errors
      theme/                design tokens (colours, spacing, font sizes, touch target)
      query/                query client and its session handling, the Result to query convention, the tuning of retries, error codes
      services/             what the shared components take from the outside (CoreServices: the demo, the notices)
      state/                the interface store of what belongs to no feature, and the epoch of the access
      format/               dates, times and numbers for the locale of the user, and the provider that shares them
      accessibility/        what the screen reader is told (announcements)
      platform/             the platform checks, spelled once
      navigation/           the routes, the focus of a screen
      testIds.ts            the test ids of the shared components (each feature declares its own)
  features/               one folder per feature (README.md in each), each with domain/, application/, infrastructure/ and presentation/
    auth/                 who the user is: User, Session, the app lock, the session guards, the session gate, the purge of what a session left, its errors, HttpAuthSession, SessionVault, the biometrics, the access store, the sign-in and lock screens
    meetings/             the meetings: entities, ListMeetings, GetMeeting, loadMeeting, the port that evicts documents, the HTTP repository, the SQLite and in-memory caches, the list and detail screens, the slot of the resolution actions
    documents/            opening a document: DocumentLocation, Watermark, OpenDocument, CloseDocument, ObserveScreenCapture, its errors, the screen protection (coordinator, native adapter), the document cache and content on disk, the cache's purger and evictor, the document screen
    votes/                casting a vote: Vote, OutboxVote, withVoteRecorded, its errors, CastVote, SyncPendingVotes, the port that records a vote in the meeting, the outbox (SQLite, in-memory), the HTTP repository, the vote dialog and the pending votes screen, the plugs into the meetings and the banner
  composition/            the composition: the one place that knows every feature (README.md)
    container/            composition root: configuration, ports, wiring, the choice of the monitoring, container
    persistence/          the history of the migrations and the schema (tables and indexes) of the database of the whole file; the names are each feature's
    device/               the real device (expo-sqlite, expo-secure-store, expo-crypto, expo-local-authentication, expo-network, the local module ScreenProtection)
    dev/                  the simulated world of the mock configuration: in-memory/ (the simulated server, its seed and fixtures, the repositories and auth over it), mock-api/ (the routes of the API over the simulated server: shared by the HTTP tests and by npm run mock:api), pdf/ (the tiny PDF writer of the demo content)
    shell/                the app shell: navigation (the navigator, protected screens, the error boundary, the system links), services (the aggregate of use cases and settings the root hands over, the providers of the app and its state, the gate that starts it), session (the controller of the session and of the life of the app: the lock and the privacy cover on the way back, the connection), the catalog of errors, the registry of test ids, the header actions
    glue/                 the glue between features, pure (the list of purgers, the recorder of a vote, the retryable codes) and the tests that need every feature at once (the values that are stored, the limits, the security scenarios, the error codes)
  testing/                test support that serves several scopes: builders of fixtures, the fakes assembled for the use cases, the HTTP world, the render helpers (test support)
assets/                   app icons (Expo template placeholders)
modules/screen-protection/ the local Expo module ScreenProtection: Swift, Kotlin and its TypeScript entry (see "Native module: ScreenProtection")
plugins/                  the local config plugin that puts the iOS project on the scene life cycle (to delete with SDK 58)
tooling/                  tests of the repository configuration (including the lint rules, the shared spec against the code and the links of the documents), types for the JS configs, mock-api/ (the mock API as a program), app-routes/ (the route files the scenario tests mount, each a re-export of one of app/), generate-fixtures/ (the script that made docs/spec/fixtures)
.env.example              the settings the app reads from the environment
app.config.ts             typed Expo config
eslint.config.mjs         ESLint flat config with the architecture rules
jest.config.js            Jest projects and coverage gate
eas.json                  the EAS build and submit profiles (see "CI/CD")
.github/                  the pipeline and the dependency updates (see "CI/CD")
.maestro/                 end-to-end flows (see "Testing strategy")
fastlane/                 the Fastlane alternative (see "CI/CD")
```

## Features

Each feature crosses the layers. The table says what the user gets and where to read it; the deep dives are under [Design in depth](design-in-depth.md#design-in-depth).

| Feature                | What the user gets                                                                                                                                                                                                      | Where it lives                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in and session    | Sign in with an email and a password; the session is kept on the device, expires, and is ended by the server refusing it                                                                                                | `SignIn`, `SignOut`, `RestoreSession`, `requireSession`; `HttpAuthSession`, `SessionVault`; `SignInScreen`, `SessionController`                                                                                                 |
| Biometric lock         | A cold start is locked; the app locks again after 30 seconds in the background; strong biometrics only on Android, no passcode fallback                                                                                 | `AppLock`, `UnlockApp`, `EvaluateAppLock`, `appLock` policy; `DeviceBiometricGate`; `LockScreen`, `useAppLifecycle`, `PrivacyCover`                                                                                             |
| Meetings               | Upcoming and past meetings with cursor pagination and pull to refresh; a detail with the agenda, the documents and the participants                                                                                     | `ListMeetings`, `GetMeeting`, `Meeting` entity; `HttpMeetingRepository`; `MeetingsListScreen`, `MeetingDetailScreen`, `useMeetingsList`                                                                                         |
| Voting                 | A vote on an open resolution, final, confirmed by the biometrics; the reason when the user may not vote                                                                                                                 | `CastVote`, `checkVotingEligibility`, `getVotingState`; `HttpVoteRepository`; `ResolutionVoting`, `VoteDialog`, `useCastVote`                                                                                                   |
| Offline reading        | A meeting or a document already seen opens without a connection, dated "Showing saved data from ..."                                                                                                                    | `loadWithCacheFallback` (the offline policy); `MeetingCache`, `DocumentCache`; `SqliteMeetingCache`, `SqliteDocumentCache`; `StatusBanner`                                                                                      |
| Offline voting         | A vote cast offline is saved on the device, sent when the connection returns, and never lost or counted twice; a rejected vote is explained                                                                             | `VoteOutbox`, `SyncPendingVotes`, the idempotency key; `SqliteVoteOutbox`; `PendingVotesScreen`, `useVoteSync`                                                                                                                  |
| Confidential documents | A PDF with the name, the email and the time of the reader drawn over every document; confidential ones (and copies served from the cache) on a protected screen where the platform allows; a notice on a screen capture | `OpenDocument`, `CloseDocument`, `ObserveScreenCapture`, `ScreenProtectionCoordinator`, `Watermark`; `NativeScreenProtection`, `modules/screen-protection`; `DocumentScreen`, `SecureContent`, `PdfViewer`, `DocumentWatermark` |
| Encrypted local data   | The caches and the outbox are encrypted at rest; the key is in the keychain or keystore; a lost key resets the data and tells the user                                                                                  | `src/core/infrastructure/persistence` (`protectedDatabase`, `databaseKey`), `src/composition/persistence` (`migrations`), `ExpoSecureStorage`; `StatusBanner`                                                                   |
| French and English     | Every text in both languages, following the device and the per-app language setting; dates and counts formatted for the locale                                                                                          | `src/core/presentation/i18n`, `locales/fr.json`, the `expo-localization` plugin                                                                                                                                                 |
| Accessibility          | Roles and states on the controls, announcements for what appears on its own, contrast checked by a test, 44 point targets                                                                                               | `LiveText`, `useAnnounce`, `SegmentedControl`, `theme/tokens.ts`                                                                                                                                                                |
| Failure handling       | Every failure has a message and, when asking again can help, a retry; a screen that crashes is replaced; a build that cannot start says why                                                                             | `AppErrorBoundary`, `StartupFailureScreen`, `QueryFailure`, the `Result` errors of `src/core/domain/errors`                                                                                                                     |
| Error reporting        | Crash and error reports, scrubbed to identifiers and codes, when the build has a Sentry address; the console otherwise                                                                                                  | `Monitoring` port, `SentryMonitoring`, `createMonitoring`, `ConsoleMonitoring`                                                                                                                                                  |
| Demo and mock server   | Two demo accounts, a switch that cuts the simulated network, and a mock API that can be run on a laptop                                                                                                                 | `InMemoryBackend`, `seed`, `DemoControls`; `MockApi`, `tooling/mock-api`                                                                                                                                                        |
