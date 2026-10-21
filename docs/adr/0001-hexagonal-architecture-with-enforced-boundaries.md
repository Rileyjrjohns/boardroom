# 0001. Hexagonal architecture with enforced boundaries

- Status: Accepted
- Related: [0008](0008-result-type-instead-of-exceptions.md), [0009](0009-manual-dependency-injection-in-one-composition-root.md), [0010](0010-zod-at-the-adapter-boundary-only.md)

## Context

Boardroom holds rules that must stay right whatever the framework does: who may vote, what the app shows offline, when the app locks, when a session is over. Those rules have to be tested without a device, and they have to outlive an Expo SDK upgrade, a router change or a new storage engine. An architecture that is only a convention erodes with the first deadline, and a code review catches little of it.

## Decision

The code is split in five layers, plus the route files of `app/`, and the allowed imports are a rule of the repository, not of the reader:

| Layer            | May import                                |
| ---------------- | ----------------------------------------- |
| `domain`         | nothing (itself only)                     |
| `application`    | `domain`                                  |
| `infrastructure` | `application`, `domain`                   |
| `presentation`   | `application`, `domain`                   |
| `di`             | `infrastructure`, `application`, `domain` |
| `app/` (routes)  | `presentation`, `di`                      |

`eslint-plugin-boundaries` enforces it in `eslint.config.mjs`: every file under `app/` and `src/` must belong to a layer (`boundaries/no-unknown-files`), a layer may not import a file that is not part of a layer (`boundaries/no-unknown-dependencies`), and the allowed edges are listed in `boundaries/dependencies`. The same configuration keeps external packages where they belong: `domain`, `application` and `di` import no package at all, `zod` and the native modules of the device only `src/infrastructure`, TanStack Query and Zustand only `src/presentation`, and `fetch` is called by one module. `tooling/lint-rules.test.ts` lints snippets with the real configuration, so a rule that stops working fails a test. ESLint runs with zero warnings allowed in `npm run validate` and, on the staged files, in the pre-commit hook.

Features are the second axis, not the first: inside a layer the code is grouped by feature (`application/use-cases/votes`, `meetings`, `documents`, `auth`).

## Consequences

- `domain` and `application` run in plain Node in the Jest project `core`, with a 90 percent coverage gate; no emulator is needed to test the business rules.
- Swapping an adapter is wiring (the `mock` and `http` configurations differ by the adapters only).
- Every external thing costs a port, an adapter, a fake and a contract suite. That is more files and one more hop to read.
- A feature touches several folders. The names of the use cases and of the screens are what keep them findable.
- The lint configuration is a part of the product: it is large and has its own tests. Some bypasses cannot be seen by a lint rule (an aliased `require`), which [the architecture document](../architecture.md#how-the-rule-is-enforced) states.

## Alternatives considered

- **Feature folders only.** A folder per feature says where code lives, not what it may depend on. Nothing stops a screen from importing `expo-sqlite`, and the rules that cut across features (the offline policy is shared by meetings, documents and votes) have no home. Layers are the axis on which the dependency constraints differ; features are the axis on which change happens, so they come second.
- **Feature folders with the layers inside each feature**, with a boundary rule per feature. The likely evolution for a much larger app; not needed for one bounded context.
- **A convention in a document, enforced by review.** Cheap and fragile.
- **Separate packages in a monorepo.** The strongest wall, and a heavier build for a single app.
- **dependency-cruiser or Nx module boundaries.** Equivalent in effect; `eslint-plugin-boundaries` was chosen because it reports in the editor, in the pre-commit hook and in the lint step that already exists.
