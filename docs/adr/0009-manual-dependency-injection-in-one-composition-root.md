# 0009. Manual dependency injection in a single composition root, with two configurations

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md), [0005](0005-offline-first-with-a-sqlite-outbox.md)

## Context

The use cases depend on ports. Something has to build the real adapters, wire them, and be replaced in tests. The app must also run in two ways: against a simulated server with in-memory stores (a demo with nothing to deploy) and against the real HTTP API, encrypted SQLite, the keychain and the device. A release build must never start on the simulated server by accident.

## Decision

`src/di` is the only place where ports meet adapters, by manual constructor injection with typed `deps` objects: no container library, no lookup by name, no decorators, no module-level instance.

- `createContainer(config, runtime)` builds a whole independent object graph and returns `Promise<Result<Container, ContainerError>>`; it never rejects. `startContainer` first parses the raw settings.
- The configuration is a discriminated union, `mock` or `http`, validated in one place (`parseConfiguration`); each invalid setting is a start error with its own code. The ports of each configuration are built by `mockPorts.ts` and `httpPorts.ts`; `wireUseCases.ts` is the same for both.
- The few objects that hold something in memory (`AppLock`, `ScreenProtectionCoordinator`, `CastVote`, `SyncPendingVotes`) are created once there and shared, and the wiring says why.
- `ContainerRuntime` replaces the clock, the monitoring, the sleep and the device in a test.
- The environment is read once, in `app/_layout.tsx`. A missing or empty adapters setting means `mock` in a development build and is the error `missingAdaptersSetting` in any other, so a release build that was not told what it talks to does not start.
- Presentation never imports `di`. It declares the shape it needs (`AppServices`) and the container satisfies it structurally. `di` imports no external package.

## Consequences

- The whole graph can be read in a few files, and the type checker fails when a use case gains a dependency that nobody supplies.
- Tests build the real container in both configurations (`createContainer.http.test.ts` runs sign-in, offline voting and sync over Node's SQLite and MSW).
- Adding a port means touching `Ports.ts` and both wirings. That is deliberate friction.
- There is no lazy construction or scoping by request; the container is built once per app instance, which is all this app needs.
- The mock configuration ships in every build, release included (it is a configuration of the app, and [the security document](../security.md#what-is-in-the-release-bundle) documents what that puts in the binary, and the build-time flag that would remove it).

## Alternatives considered

- **A container library (tsyringe, InversifyJS).** Needs decorators and `reflect-metadata` or string tokens, resolves at run time what the compiler can check, and would be an external import in `di`.
- **React context as a service locator.** Pushes construction into components and tests, and tempts a screen to reach an adapter.
- **Module-level singletons.** Simple, and shared across tests; nothing can start or fail in a controlled way.
- **`jest.mock` in tests.** Replaces modules instead of injecting objects; the fakes and the contract suites exist so that it is not needed.
