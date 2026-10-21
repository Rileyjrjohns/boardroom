# 0007. EAS as the default delivery pipeline, with Fastlane as a documented alternative

- Status: Accepted
- Related: [0002](0002-expo-continuous-native-generation-and-dev-client.md), [0012](0012-security-model.md)

## Context

A store build needs a generated native project (it is not committed, see [0002](0002-expo-continuous-native-generation-and-dev-client.md)), signing credentials, a build number that only goes up, a submission to TestFlight and Google Play, and a way to ship a JavaScript fix without a store review. Crash reports have to be readable. The team may or may not own Macs, and some organisations forbid signing material on a third party. The pipeline has to be something a reader can follow from the repository alone.

## Decision

EAS is the default, driven by GitHub Actions; Fastlane is kept, working and documented, as the alternative.

- **CI** (`.github/workflows/ci.yml`) is `npm run validate` taken apart in two jobs that run side by side: one for the boundary rules of the architecture, one for lint, typecheck, format and the tests with the coverage gate. It runs on pull requests and on `main`; the build workflow calls it and waits for both jobs, and the update workflow waits for the whole run. Every job runs on `ubuntu-24.04`, not on `ubuntu-latest`, so that the runner changes by a commit and not under the repository.
- **EAS Build and Submit** (`eas.json`, `.github/workflows/eas-build.yml`): three profiles (`development`, `preview`, `production`), each setting `EXPO_PUBLIC_BOARDROOM_ADAPTERS` itself because a release build never guesses it; build numbers kept remotely; a tag `v*` builds the **preview** profile (internal distribution, no store submission) after the CI passes, and checks that the tag is the `version` of the app, with or without a suffix such as `-rc.1`. The **production** profile is built **by hand only** (`workflow_dispatch`), and the submission to TestFlight and to the internal track of Google Play (as a draft) is an option of that manual run. A tag can never reach a store: that is a decision of a person.
- **EAS Update** (`eas-update.yml`) publishes the JavaScript of a green `main` to the `preview` channel. The runtime version policy is `appVersion`: an update reaches only builds with the same `version` as `app.config.ts`.
- **Sentry** receives crash reports through an adapter of the `Monitoring` port; it is off without an address.
- **Fastlane** (`fastlane/`, `Gemfile`) does the work of EAS Build and Submit from the machine that runs it: lanes `ios beta` and `android internal`, a `prebuild` lane that uses the environment of the production profile of `eas.json` (one source of values), signing through `match` and an upload key, secrets from the environment only. It gives no over-the-air updates. It is the alternative to the by-hand production build and submission above, and no workflow runs it.
- [The CI/CD document](../ci-cd.md#fastlane-the-alternative-to-eas) says when to choose which.

## Consequences

- No Mac is needed to ship, credentials are managed, build numbers and updates come from the same tool, and the profiles are readable configuration.
- A third party holds the credentials and runs the builds: a queue, a bill, and a dependency on a service. The Fastlane path exists for the organisations for which that is not acceptable, and it has a cost of its own (a machine, `match`, a Ruby toolchain).
- Two paths have to stay consistent. `tooling/release.test.ts` checks the workflows, `eas.json` and the Fastlane files against each other, and Fastlane reads its values from `eas.json`.
- Going to the stores takes a manual run of the build workflow, on purpose: a tag, which is cheap to push and easy to push by mistake, only produces a build for the testers.
- The runtime version needs discipline: a native change without a new `version` sends an update to a build that cannot run it.
- **None of it was run against real accounts.** The configuration was validated and tested, and the workflows, the EAS servers, the Fastlane lanes and the Sentry delivery were not run; [the CI/CD document](../ci-cd.md#what-was-run-and-what-could-not-be) says so.

## Alternatives considered

- **Fastlane as the default.** Full control and local builds, with signing, a Mac, build numbers and the Ruby toolchain to keep alive, and no updates over the air. It remains the alternative.
- **A tag that builds and submits the production profile.** One push ships to the stores, so a wrong commit or a version that is not ready becomes an upload. A tag builds the preview instead, and the store build is a manual run.
- **GitHub Actions calling Gradle and Xcode directly.** No extra tool, and every concern of Fastlane and EAS (signing, numbering, submission, caching) written by hand.
- **Another hosted mobile CI (Bitrise, Codemagic).** Comparable to EAS for builds; EAS was kept for its integration with prebuild, the profiles and EAS Update.
- **No over-the-air updates.** Simpler and safer, and every fix then waits for a store review.
