# 0005. Offline-first with a SQLite outbox, and the offline policy in the use cases

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md), [0012](0012-security-model.md)

## Context

A board member must be able to read the papers they already opened and to cast a vote on a train without a connection. A vote is secret, final and counted once, so losing one, sending one twice or letting a stale screen vote on a closed resolution are all wrong. The data is confidential, so a copy that is silently out of date is wrong too. The device clock and the network are not to be trusted.

## Decision

"Offline-first" here means that a write never needs the network at the moment of the action, and that a read degrades to a dated copy. Reads are not cache-first.

- **The policy is application code**, in one place (`application/shared/loadWithCacheFallback.ts`), not a behaviour hidden in an adapter. It asks the remote source first. On success it writes the data through to the cache and returns it `fresh`. Only when the network is unavailable, and nothing else, it returns the cached copy `stale` with its date, if the entry is not older than the maximum age (seven days; an older entry, or one dated in the future, is a miss). `unauthorized` ends the session and empties both caches; `forbidden` and `notFound` remove the item and what hangs off it; any other error is returned as it is. Before anything is written or returned, the policy checks that the same user is still signed in.
- **Votes go through an outbox** (`VoteOutbox`, on encrypted SQLite). `CastVote` submits; if the network is down, or the server fails in a way that says nothing about the vote, the vote is queued and the user is told it is saved on the device. `SyncPendingVotes` sends the queue oldest first, one vote at a time, when the connection returns, when the app returns to the foreground and after a sign-in or an unlock. The application layer does not watch the network: the presentation triggers the run.
- **Idempotency key.** Each vote carries a key built from the resolution and the voter (also sent as the `Idempotency-Key` header, and checked by the server against the body). A replay after a lost answer is recorded once; a different choice under the same key is `alreadyVoted`. The outbox holds the key in a `UNIQUE` column, so two callers enqueue it once.
- **Business rejections are final**, and the vote is kept as `rejected` with its reason until the user acknowledges it. Only `networkUnavailable` and `unauthorized` stop a run without counting an attempt; an unexpected failure counts one, and after five the vote is given up and shown.
- **Quarantine.** A row that no longer reads back as a vote is never deleted by a read and never overwritten. It is marked `quarantined`, counted, shown to the user, and removed only when they ask.
- The outbox is not cleared at sign-out: a vote belongs to its voter and is sent when they come back.

## Consequences

- The offline behaviour can be read and tested in one file, against fakes, with the same contract suites run against the SQLite adapter.
- The user is never shown a copy without being told, and the server stays the judge of every vote (it stamps its own time and ignores `castAt`).
- Reads cost a round trip even when a copy exists, and a flaky network shows saved data more often than a cache-first design would. The timeout is 15 seconds.
- Sync runs only while the app is in the foreground. There is no background task; a vote waits for the next foreground.
- A vote cast offline is judged by a possibly stale copy of the meeting (a courtesy check); the server may still refuse it, and the user is told afterwards.

## Alternatives considered

- **Cache first, then revalidate.** Faster screens, but staleness becomes invisible, and eligibility to vote depends on server truth.
- **Persist the TanStack Query cache.** It would put the policy in the presentation layer and tie the stored format to the query shapes. The query cache is kept short on purpose (one minute stale, five minutes unused).
- **A sync framework or database (WatermelonDB, Realm, redux-offline).** More machinery than a one-way queue of final writes needs, and an engine other than the encrypted SQLite the app already has.
- **CRDTs or merge rules.** There is nothing to merge: a vote is final and unique per voter and resolution.
- **A background task for the outbox.** The right next step for a real deployment; the idempotency key already makes two senders safe.
