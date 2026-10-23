# 0008. A Result type instead of exceptions across layers

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md), [0004](0004-tanstack-query-and-zustand-rather-than-redux.md)

## Context

In this app almost every failure is expected and has a meaning for the user: the network is down, the session ended, the app is locked, a vote was refused, a row cannot be read. A thrown value hides which of those can happen, and an unhandled one is a crash. The business layers must also stay free of any library.

## Decision

Every operation of `domain` and `application` that can fail returns `Result<T, E>` (`src/core/domain/shared/Result.ts`, a few lines, no dependency), or `Promise<Result<T, E>>`.

- The error is plain data: a `code` taken from a const object plus the fields that matter, grouped by concern: the families of the core in `src/core/domain/errors`, each feature's in its own `domain/errors` (see [0015](0015-feature-first-hexagonal-architecture-with-links-inverted-through-the-composition.md)). It carries no text, because the translation happens in the presentation, and its `cause` never holds personal data.
- Production code of `domain` and `application` never throws: a lint rule forbids `throw` there (tests and `testing` folders may).
- The contract of every port says that an adapter never throws and never rejects, and settles in bounded time. An adapter turns whatever its library does into an error `Result` (the HTTP client, the SQLite and file adapters, the native wrappers). `createContainer` never rejects either: a native module that fails to load is `platformUnavailable`.
- At the border with TanStack Query, a query function throws a `QueryFailure` that wraps the error of the `Result`, so the failed query keeps its last data and exposes a typed code (see [0004](0004-tanstack-query-and-zustand-rather-than-redux.md)).

## Consequences

- A use case states in its type every failure it can return, and a `switch` on the code is checked for completeness. Maps from a code to its translation key are typed over the whole set of codes, so a code without a text fails the typecheck.
- The unhappy paths are tested like the happy one, since they are ordinary return values.
- Call sites are longer (`isErr` after each call), and the discipline has to hold at every adapter. A library that throws something unexpected is caught at the adapter and reported as an unexpected error, not allowed through.
- Two conventions meet at the presentation (values in the application, exceptions in TanStack Query); one file, `query/QueryFailure.ts`, is where they are explained.

## Alternatives considered

- **Exceptions with typed classes.** Idiomatic and short, but the possible failures are not in the signature, and a forgotten `catch` becomes a crash on a device.
- **A library (neverthrow, fp-ts, Effect).** Richer combinators, but `domain` and `application` import no external package, and the team has to learn the library as well as the pattern. The helpers needed here (`map`, `andThen`) fit in one file.
- **Promise rejections with error codes.** Loses the typing of the error side and does not cover synchronous code.
