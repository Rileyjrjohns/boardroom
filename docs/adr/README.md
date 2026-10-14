# Architecture decision records

An architecture decision record (ADR) is a short page that says what was decided, why, and what it costs. They are numbered, kept in the repository, and never rewritten once accepted: a changed decision is a new record that supersedes the old one. The format is a light version of MADR: **Status**, **Context**, **Decision**, **Consequences**, **Alternatives considered**.

The records 0001 to 0007 are the choices of the stack and of the architecture; 0008 to 0013 are decisions taken while building this repository, each one visible in the code. The README of the repository ([Architecture](../../README.md#architecture), [Mobile security](../../README.md#mobile-security)) is where to see them at work.

| ADR                                                                 | Title                                                                        | Status                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| [0001](0001-hexagonal-architecture-with-enforced-boundaries.md)     | Hexagonal architecture with enforced boundaries                              | Accepted                                 |
| [0002](0002-expo-continuous-native-generation-and-dev-client.md)    | Expo with Continuous Native Generation and a development client              | Accepted                                 |
| [0003](0003-expo-router-with-typed-routes.md)                       | expo-router with typed routes                                                | Accepted                                 |
| [0004](0004-tanstack-query-and-zustand-rather-than-redux.md)        | TanStack Query for server state, Zustand for the little UI state             | Accepted                                 |
| [0005](0005-offline-first-with-a-sqlite-outbox.md)                  | Offline-first with a SQLite outbox, and the offline policy in the use cases  | Accepted                                 |
| [0006](0006-expo-modules-api-for-screen-protection.md)              | Expo Modules API rather than a raw TurboModule for ScreenProtection          | Accepted                                 |
| [0007](0007-eas-as-the-default-delivery-pipeline.md)                | EAS as the default delivery pipeline, Fastlane as a documented alternative   | Accepted                                 |
| [0008](0008-result-type-instead-of-exceptions.md)                   | A Result type instead of exceptions across layers                            | Accepted                                 |
| [0009](0009-manual-dependency-injection-in-one-composition-root.md) | Manual dependency injection in one composition root, with two configurations | Accepted                                 |
| [0010](0010-zod-at-the-adapter-boundary-only.md)                    | zod at the adapter boundary only                                             | Accepted                                 |
| [0011](0011-i18n-from-the-first-screen-with-typed-keys.md)          | Internationalisation from the first screen, typed keys, no magic strings     | Accepted                                 |
| [0012](0012-security-model.md)                                      | Security model                                                               | Accepted                                 |
| [0013](0013-uiscene-life-cycle-through-a-local-config-plugin.md)    | The UIScene life cycle on SDK 57 through a local config plugin               | Accepted, to be removed with Expo SDK 58 |

## Writing a new record

Copy the headings of any record, take the next number, and keep it to one page. State the context with the facts that force the decision, say what was decided in terms that can be checked in the repository, be honest about the consequences that hurt, and list the alternatives that were really considered, with the reason each lost. If a decision replaces an earlier one, set the status of the earlier record to "Superseded by NNNN" and say so in the new one.
