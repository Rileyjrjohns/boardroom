# 0004. TanStack Query for server state, Zustand for the little UI state

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md), [0008](0008-result-type-instead-of-exceptions.md)

## Context

Almost all the state a screen shows is data that belongs to a server: lists with cursors, a meeting, the votes waiting in the outbox. It needs loading and error states, pagination, refresh, retries and invalidation. The persistent copy and the offline rules are already in the use cases (see [0005](0005-offline-first-with-a-sqlite-outbox.md)), so the client cache only has to avoid asking again for what was just asked. What is left is a handful of facts that no query holds: where the user stands (signed out, locked, open), the connection, the privacy cover, the selected period.

## Decision

- **TanStack Query 5** for server state. A query function calls a use case and throws a `QueryFailure` that wraps the error of its `Result`, so a failed query keeps the data of its last success next to the error and the retry policy can read the code (network and unexpected errors twice with a backoff, the others never). One factory builds the query keys. One place, the `QueryCache` and `MutationCache` of the query client, ends a session for the whole app. A mutation is never retried and is dropped from memory as soon as nothing observes it.
- **Zustand 5** for interface state, with a handful of fields (`meetingsPeriod`, `access` and its epoch, `sessionEndedBy`, `connectivity`, `privacyCover`, `syncSummary`, `localDataResetNotice`). The store and the query client are created per app instance and handed down by context: no module-level store, so tests are isolated.
- Both libraries may be imported by `src/presentation` only (a lint rule). The other layers know nothing of them.

## Consequences

- No reducer, action or selector code for data that a query already models; the interface store stays small enough to read in one sitting.
- The convention "a query throws a `QueryFailure`" is the seam between the `Result` world and the TanStack world. It has to be followed by every query and mutation, and one hook (`useResultMutation`) carries it for actions.
- The query cache holds confidential data in memory. It is emptied when the user leaves the open app and unused queries are dropped after five minutes.
- Two libraries to learn instead of one, with a clear border between them: if a piece of state comes from a use case, it is a query.

## Alternatives considered

- **Redux Toolkit (with RTK Query).** Capable and well understood. It brings one store for server and interface state, more ceremony for the same behaviour, and a global store by default. RTK Query would also move the cache policy next to the reducers instead of the use cases.
- **React context with `useReducer`.** Fine for the interface state, and no answer for pagination, retries and invalidation of server data.
- **SWR.** Similar to TanStack Query for reads, with a thinner story for infinite lists and mutations.
- **MobX or Jotai for the interface state.** Equivalent in size; Zustand was kept for its small API and its plain store that is easy to create per instance.
