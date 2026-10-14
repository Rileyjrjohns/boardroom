# 0003. expo-router with typed routes

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md)

## Context

Which screens exist depends on where the user stands: signed out, locked or open. A deep link must never reach a screen that the current state does not allow, and the back stack must never return to one. Routes should be checked by the compiler, and route files should stay thin so that the layers behind them stay testable.

## Decision

expo-router (file-based routes on top of React Navigation) with `experiments.typedRoutes: true`.

- `app/` holds route files that only mount a screen of the presentation layer, plus `_layout.tsx` (the root layout, the one place that reads the environment and starts the composition root) and `+native-intent.tsx`.
- `AppNavigator` uses `Stack.Protected` with one guard per state of access: the sign-in route exists for a signed-out user, the lock route for a locked app, the others for an open app. A screen whose guard is false is not in the stack, so no link reaches it and the history cannot return to it.
- The routes are written once in `presentation/navigation/routes.ts`; `tooling/routes.test.ts` fails when a constant names a file that does not exist.
- The route tests mount the real route files (`tooling/app-routes/`) over the fakes of the ports.

## Consequences

- Deep links and protected screens come from the router, with no linking table to keep in step.
- Hrefs are typed. The types (`.expo/types/router.d.ts`) are written only while the dev server runs, so a fresh clone, and a CI job, do not check `href` values until Metro has run once. The README says so.
- A file name is a public name: renaming a file is a route change. Test files cannot live under `app/`.
- The project depends on the release cadence of expo-router, and some of its API still carries `dangerously` in its name (`dangerouslySingular`).

## Alternatives considered

- **React Navigation alone.** Its static configuration can type routes and can hide screens behind conditions too, so capability is not the difference. What expo-router adds is the file convention, deep links by default and one place for the protected screens, with less configuration to keep in step. It remains a possible fallback, since expo-router is built on it.
- **React Native Navigation (native navigation).** Native transitions, but a native setup of its own and a weaker fit with Expo's generated projects.
- **A hand-written navigator state.** More control, and every guarantee above to build and test again.
