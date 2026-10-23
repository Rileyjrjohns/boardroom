# Quick start

The [README](../README.md#run-it-in-2-minutes) has the two-minute version. This page is the whole of it: the settings, the demo accounts, the mock API, the environment variables and the npm scripts.

Prerequisites: Node.js 24 (`.nvmrc`) and npm 11. To run the app you also need a native toolchain: Xcode for iOS, or Android Studio with an emulator for Android.

```sh
nvm use            # picks the Node version from .nvmrc
npm install        # installs the dependencies and the git hooks (the "prepare" script)
npm run android    # or: npm run ios. Builds the development client, installs it and starts Metro
```

That is the whole of mock mode: in a development build the app runs on a simulated server with in-memory data, so there is no server to start, no account to create and no network needed. Once a development client is installed, `npm start` (`expo start --dev-client`) only starts Metro and the client connects to it.

**The development client is not optional.** The app contains native code that Expo Go does not have (SQLite built with SQLCipher, `react-native-pdf`, the local module ScreenProtection), so Expo Go cannot run it, and the first `npm run android` or `npm run ios` generates `ios/` or `android/` with `expo prebuild` and does a native build, which takes minutes. Keep the path of the project free of spaces: an Expo build script (expo-constants) fails on one. A client built before the document viewer was added lacks `expo-file-system` and `react-native-pdf`: rebuild it. Built with Xcode 27, the iOS 27 SDK requires the UIScene life cycle, which a local config plugin provides (see [iOS scene life cycle](build-setup.md#ios-scene-life-cycle)). See [What is not verified](not-verified.md#what-is-not-verified) for what has been run where.

To check the repository without running the app: `npm run validate` runs lint, typecheck, the format check and the tests with the coverage gate.

## Running against the simulated server

In a development build mock mode is the default, so the commands above are all it takes: no server, no account to create, no network. `EXPO_PUBLIC_BOARDROOM_ADAPTERS=mock npm run ios` says the same thing explicitly, and a build that is not a development one (a release build) has to say it, because it never guesses (see the table).

**What state the app starts in.** Both configurations start the way a cold start does. With nobody signed in the app opens on the sign-in screen, and in the mock configuration that screen offers the two demo accounts below (a button each fills in the form). With a session stored on the device (only the http configuration keeps one across restarts) it opens on the lock screen, because a restored session always needs the biometric unlock. After a sign-in or an unlock it lands on the meetings list. See [Session, lock and navigation](design-in-depth.md#session-lock-and-navigation) for the whole flow.

**A two-minute tour.** Sign in as Alice (a button on the sign-in screen fills the form). Open a meeting and press a choice on an open resolution: the confirmation step explains that the vote is final and asks for the biometrics (the mock configuration recognises you). Now open the area marked "Demo" and switch on "Simulate being offline": the offline banner appears. Open a meeting you have already seen, vote on another resolution, and the vote is queued ("saved on this device"). Open the pending votes from the header of the list to see it. Switch the connection back on: the vote is sent, the summary says so, and the outbox is empty. Open a confidential document: the name of the reader is drawn over the PDF.

The setting is the environment variable `EXPO_PUBLIC_BOARDROOM_ADAPTERS`, documented in `.env.example` (copy it to `.env`, which is git-ignored, to change it; restart Metro with `npm start -- --clear` afterwards, because Expo reads it when Metro starts).

| Value            | Effect                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| missing or empty | In a development build, the mock adapters: the same as `mock`. In any other build, refused: the code is `missingAdaptersSetting`                                                                                           |
| `mock`           | The mock adapters: in-memory repositories, caches and outbox, behind a simulated server                                                                                                                                    |
| `http`           | The real adapters, against the API at `EXPO_PUBLIC_BOARDROOM_API_BASE_URL` (see [Running against the mock API](#running-against-the-mock-api)). A missing, malformed or insecure address is refused with a code of its own |
| anything else    | Refused: the app shows a screen with the technical code `invalidAdaptersSetting`. A typo must not start the demo against the wrong thing                                                                                   |

The two demo accounts of the simulated server share the password `boardroom-demo` (it protects nothing, the accounts exist only in the simulation): `alice.martin@boardroom.example`, who is a voting member of most meetings, chairs some, and attends two as a guest and one as the secretary; and `bruno.durand@boardroom.example`, who is invited to two meetings out of three, so the two users see different lists. The meetings are the fixtures of [`docs/spec/fixtures`](spec/fixtures/README.md) with their dates shifted to the clock at start-up, so there are always upcoming and past ones. The resolutions follow the date of their meeting: open before it takes place (the demo user can vote on several right away, the minutes of one are already voted), closed after it started once it is behind, and a few past ones are still open by status although their voting window is over.

## Running against the mock API

The `http` configuration needs a server. `npm run mock:api` starts one on this computer: the routes of `docs/api.md`, over the simulated server and the seed of the mock configuration, so that the real adapters (the HTTP client, the encrypted SQLite database, the secure storage) can be tried with nothing to deploy.

```sh
npm run mock:api                    # http://127.0.0.1:4000
npm run mock:api -- --port 4010     # another port (or MOCK_API_PORT=4010)
npm run mock:api -- --latency 800   # slower answers, in milliseconds (default 200)
npm run mock:api -- --host 0.0.0.0  # reachable from a phone on the same network
```

It prints the address, the two accounts and the value to put in `.env`. Then start the app against it:

```sh
# .env
EXPO_PUBLIC_BOARDROOM_ADAPTERS=http
EXPO_PUBLIC_BOARDROOM_API_BASE_URL=http://localhost:4000    # iOS simulator
# EXPO_PUBLIC_BOARDROOM_API_BASE_URL=http://10.0.2.2:4000   # Android emulator
# EXPO_PUBLIC_BOARDROOM_API_BASE_URL=http://192.168.1.20:4000 # a phone: the address of the computer, with --host 0.0.0.0
```

`10.0.2.2` is how the Android emulator names the computer it runs on. A development build accepts `http` for any host, which is what a phone needs; any other build accepts it only for this machine (`localhost`, `127.0.0.1`, `[::1]`, `10.0.2.2`) and requires `https` elsewhere (`insecureApiBaseUrl`). The system has its own say, and it is stricter: the iOS project that Expo generates allows cleartext traffic to the local network only (`NSAllowsLocalNetworking`), and the Android one allows it in debug builds only. A release build therefore talks to a real server over `https`, and the exceptions of the app are there for development.

It is a program of its own, and neither it nor MSW is part of the app bundle (see [What is in the release bundle](security.md#what-is-in-the-release-bundle)): `tooling/mock-api/` holds the entry point (`main.ts`) and the translation between the `http` module of Node and the `Request` and `Response` of the API (`server.ts`), and the routes are `MockApi` in `src/composition/dev/mock-api`, the same code that answers the HTTP tests through MSW. There is no framework, no build and no dependency: Node 24 runs the TypeScript sources directly. Stripping the types alone is not enough here, because the sources use parameter properties (`constructor(private readonly deps)`), which only `--experimental-transform-types` handles, so the script passes it. Node does not know the `@core/*` aliases of `tsconfig.json` either: `tooling/mock-api/register.mjs` is a small resolver hook (`module.registerHooks`) that reads them from `tsconfig.json` and adds the missing `.ts` extensions. `tooling/mock-api/main.test.ts` starts the real command and asks it something. The tokens are forgotten when it stops, so an app that holds a session from a previous run is told `401` and starts over.

`ios/` and `android/` are produced from `app.config.ts` by Continuous Native Generation and are never committed. Native configuration lives in `app.config.ts` and in config plugins, never in the generated folders (see [ADR 0002](adr/0002-expo-continuous-native-generation-and-dev-client.md)).

## Environment variables

Only the first three reach the app, and only variables that start with `EXPO_PUBLIC_` can: Expo replaces them in the bundle, so none of them is a secret. All are documented in `.env.example`; `tooling/environment.test.ts` fails when the app reads one that is missing from it. Copy the file to `.env` (git-ignored) and restart Metro with `npm start -- --clear` after a change.

| Variable                                            | Read by                                   | What it does                                                                                                                                                            |
| --------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_BOARDROOM_ADAPTERS`                    | the app (`mock`, `http`)                  | Which configuration the app starts with (see the table above)                                                                                                           |
| `EXPO_PUBLIC_BOARDROOM_API_BASE_URL`                | the app (`http` only)                     | Where the API is                                                                                                                                                        |
| `EXPO_PUBLIC_SENTRY_DSN`                            | the app                                   | The address of the Sentry project. Empty means off: the events go to the console (see [Monitoring: Sentry behind the port](ci-cd.md#monitoring-sentry-behind-the-port)) |
| `EAS_PROJECT_ID`                                    | `app.config.ts`                           | The EAS project: the URL of the updates. Without it the updates are off in the build                                                                                    |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | `app.config.ts`, the native build scripts | Together, they add the upload of the source maps to the native builds. The token is a secret and is never written in a file                                             |
| `SENTRY_URL`                                        | `app.config.ts`                           | The Sentry server, for an organisation that is not on `sentry.io`                                                                                                       |
| `BOARDROOM_BUILD_NUMBER`                            | `app.config.ts`                           | The build number of a store build, set by the Fastlane lanes (EAS numbers the builds remotely)                                                                          |

The build-time variables are never needed to run the app; see [CI/CD](ci-cd.md#cicd) for where each one is set.

## npm scripts

| Script                                  | What it does                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm start`                             | Starts Metro for the development client                                                                                       |
| `npm run ios`                           | Builds and runs the iOS development client                                                                                    |
| `npm run android`                       | Builds and runs the Android development client                                                                                |
| `npm run mock:api`                      | Starts the mock API on this computer, for the `http` configuration                                                            |
| `npm run lint`                          | ESLint over the whole repository, zero warnings allowed                                                                       |
| `npm run lint:architecture`             | ESLint on `app/` and `src/` alone, where the boundary rules apply (a separate job of the CI)                                  |
| `npm run lint:fix`                      | ESLint with autofix                                                                                                           |
| `npm run typecheck`                     | `tsc --noEmit`, which also checks the JS config files at the repository root                                                  |
| `npm test`                              | Runs every Jest project, without the coverage gate                                                                            |
| `npm run test:coverage`                 | Runs Jest with coverage and enforces the 90 percent gate on `domain` and `application`                                        |
| `npm run format`                        | Prettier, write mode                                                                                                          |
| `npm run format:check`                  | Prettier, check mode                                                                                                          |
| `npm run validate`                      | `lint`, `typecheck`, `format:check` and `test:coverage`, in that order                                                        |
| `npm run e2e`, `e2e:android`, `e2e:ios` | Run the Maestro flows of `.maestro/` on a running emulator or simulator (see [Testing strategy](testing.md#testing-strategy)) |
