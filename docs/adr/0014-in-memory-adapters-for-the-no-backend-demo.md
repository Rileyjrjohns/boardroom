# 0014. In-memory adapters for the no-backend demo; MSW only for the HTTP adapter tests

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md), [0009](0009-manual-dependency-injection-in-one-composition-root.md), [0010](0010-zod-at-the-adapter-boundary-only.md)

## Context

The app must run with nothing to deploy: no server, no account, no network. It is a demonstration, and a reader should be able to install it, open it and vote. The same repository also has real HTTP adapters (a client over `fetch`, zod schemas, mappers) that must be tested against something that answers like a server, without a network.

Two different needs can be served by the same tool, and it is tempting to do so: a library that intercepts requests (MSW) could answer the app on the device and the tests in Jest. This record says why it does not.

## Decision

- **The demo runs on in-memory adapters.** The `mock` configuration of the composition root builds an adapter for every port in memory, behind one simulated server (`InMemoryBackend`) that applies the rules of the domain and has a network switch (`SimulatedNetwork`). In a development build it is the default, so `npm run ios` or `npm run android` is the whole of the setup. Nothing in the data path of the demo makes an HTTP request or fakes one.
- **MSW is used only in the tests of the HTTP adapters.** It is a development dependency, imported by one test-support file (`src/testing/infrastructure/httpWorld.ts`) and used by the `infra` Jest project, which runs in plain Node: the HTTP client and repositories, the session adapter, and the container in its `http` configuration. Its handler hands the `Request` to `MockApi`, which asks the same `InMemoryBackend` as the in-memory adapters, so one implementation of the server rules backs both configurations.
- **The same `MockApi` is also a program**, `npm run mock:api`, a small Node server with no framework, so the real adapters (HTTP, encrypted SQLite, secure storage) can be tried on a device against it. MSW is not involved there either.
- **The contract suites keep the two paths honest.** The in-memory adapters and the HTTP adapters (over MSW) run the same suites of each port.

## Consequences

- The running demo does not exercise the HTTP client, the zod schemas, the encrypted database or the keychain. They are covered by the `infra` project and by the `http` configuration against `npm run mock:api`, not by the default launch. [The quick start](../quick-start.md#running-against-the-simulated-server) says which configuration a launch uses.
- The shipped app has no interception layer and no polyfill for one. MSW and the mock API are not in the bundle; the mock configuration is (it is a configuration of the app, see [0009](0009-manual-dependency-injection-in-one-composition-root.md)).
- The offline scenario is deterministic and one switch drives all of it (repositories, connectivity, the banner).
- The simulated server is a second implementation of a server next to the real one, so the HTTP contract ([`docs/api.md`](../api.md)) is the reference both must keep, and a change to it is a change to `MockApi`.

## Alternatives considered

- **MSW in the app, with polyfills.** One mechanism for the demo and the tests. Rejected: it adds extra runtime dependencies (MSW, which is a development dependency today, and a polyfill for the web APIs it needs and React Native lacks) and a fake network layer inside the shipped app, and the demo would then run the HTTP client and the zod schemas against a fake network rather than show the architecture without them. The in-memory path is simpler and cannot fail for a reason of the interceptor.
- **Run the demo against `npm run mock:api` only.** Real adapters on the device, but a laptop and a command are needed before the first screen. It stays available as the `http` configuration.
- **Leave the mock configuration out of release builds.** A build-time flag would drop it from the bundle; it is described in the security document and not done here.
