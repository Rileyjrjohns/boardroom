# 0015. Feature-first hexagonal architecture, cross-feature links inverted through the composition

- Status: Accepted
- Supersedes: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md)
- Related: [0008](0008-result-type-instead-of-exceptions.md), [0009](0009-manual-dependency-injection-in-one-composition-root.md), [0010](0010-zod-at-the-adapter-boundary-only.md)

## Context

[0001](0001-hexagonal-architecture-with-enforced-boundaries.md) split the code in layers and enforced the imports between them. It grouped the code by feature inside the layers, and it left what happens between the features to the reader. A first reorganisation by feature (`src/core`, `src/features/<feature>`, `src/composition`) made the imports between features visible, and there were many that went the wrong way: the session of `auth` reached the caches of `meetings` and `documents`; the offline policy of the core reached the session of `auth`; the `Meeting` entity imported the `Vote`; the votes wrote into the cache of the meetings; the meetings embedded the screens of the votes; the shared components read the state and the services of the shell. Each of them is a cycle, or a core that knows the features, and each is the shortcut that the next deadline will extend.

The rule has to be the same one the Flutter twin of this repository follows, and it has to be checked by a tool, not by a reader.

## Decision

The code is organised feature first, and inside each feature (and the shared core) by the same four layers. `src/composition` is the one place that knows everything.

| Scope         | Folder                   | Imports                                                                                                              |
| ------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `core`        | `src/core`               | Itself. No feature, not the composition                                                                              |
| `auth`        | `src/features/auth`      | `core`                                                                                                               |
| `meetings`    | `src/features/meetings`  | `core`, `auth`                                                                                                       |
| `documents`   | `src/features/documents` | `core`, `auth`, `meetings`                                                                                           |
| `votes`       | `src/features/votes`     | `core`, `auth`, `meetings`                                                                                           |
| `composition` | `src/composition`        | Everything, through the rules of its layers (the container reaches the adapters, the shell reaches the presentation) |

- **The graph.** A feature may import the `domain`, the `application` and the `presentation` of the features the graph names for it, along the edges above, and never their `infrastructure`: an adapter is chosen by the composition. There is no cycle, and a feature never imports the composition. The graph is a named constant with the reason of every edge (`FEATURE_GRAPH`, `tooling/featureGraph.mjs`).
- **The layers** inside the core and inside a feature are those of 0001 and keep their rules (`domain` imports nothing, `application` imports the domain, `infrastructure` implements the ports, `presentation` never reaches an adapter, no external package where it does not belong).
- **When a feature needs something of one the graph does not allow it to import, the dependency is inverted.** The feature that owns the policy declares the port (or the slot, or the context) it needs; another feature implements it; only `src/composition` assembles them. Nothing is moved to the core to dodge a cycle. The inversions are listed, with owner, implementer and place of wiring, in [the architecture document](../architecture.md#inversions): `SessionDataPurger` (`auth`), `SessionGate` (`core`), `RecordedVoteSink` (`votes`), `MeetingDocumentEvictor` (`meetings`), the retryable codes (`core`), the families of errors (open `AppError` in `core`, one family per feature), the schema of the database (each feature owns the names of its tables, the composition owns the history of the whole file), and, in the presentation, the slot of the resolution actions (`meetings`), the notices of the banner (`core`), the catalog of errors (`core`), the state by owner and one context of services per feature.
- **Enforcement.** `eslint-plugin-boundaries` reads each folder of a layer as two elements, its layer and its scope, and captures the name of the feature. The policies of the graph are made from `FEATURE_GRAPH` and fail the build when an import goes against it; the linter configuration refuses to load a graph with a cycle or with a name that is no feature. `tooling/featureGraph.test.ts` checks that the graph lists every folder of `src/features`, and `tooling/lint-rules.test.ts` checks every rule both ways (an allowed import passes, a forbidden one fails), a fabricated cycle included. Tests and test support are held to the rules of the layers only.

## Consequences

- A feature can be read, tested and changed with the features it depends on and no others. `core`, `auth`, `meetings`, `documents` and `votes` each have a `README.md` that says what it holds and what it declares for the others.
- A rule that two features share has a visible home: the owner declares the port, and the implementation is one small class or one list in `src/composition/glue`. Adding a feature that keeps data for a user adds a purger to a list, and `auth` does not change.
- The user interface follows the same rule: the shared components take what they need from a context they declare, and a feature plugs into another through a slot. The price is a few more small files (a store, a services context and a provider for each feature) and one component, `AppProviders`, that nests them.
- The core cannot name a code of a feature, so what the screens know of the failures (which have a text, which a retry can fix, which end the session) is assembled in the composition and handed to the query client and to the components.
- Test names, test ids, texts and behaviour did not change with the reorganisation; a test that needs several features is in `src/composition/glue` or uses `@testing`.
- The lint configuration grows: a graph, its policies and their tests. It is part of the product like the rest of it.

## Alternatives considered

- **Layers only (0001).** What this record replaces. The layers are the axis on which the dependency constraints differ, but nothing in them says that `meetings` must not import `votes`, and the cycles it allowed were the cause of this record.
- **Move the shared rule to the core.** The shortest way out of a cycle, and the one that turns the core into a second application. The core would know a vote, a document and a session, and every feature would depend on all the others through it.
- **Allow the cycles and rely on review.** The pull request that closes the next cycle is the one nobody reads.
- **One package per feature in a monorepo.** The strongest wall, and a heavier build for a single app. The linter gives the same guarantee on the imports.
- **Only the domain and the application in the graph, and the presentation free.** What the Flutter twin does while it has no interface. Here the interface exists, and a screen that reaches into another feature's state is the same coupling: the graph covers the presentation, and the slots and the contexts are how it is kept clean.
