# 0010. zod at the adapter boundary only

- Status: Accepted
- Related: [0001](0001-hexagonal-architecture-with-enforced-boundaries.md), [0008](0008-result-type-instead-of-exceptions.md)

## Context

TypeScript types disappear at run time. Whatever enters the app from outside is untyped data: the answers of the API, the JSON in SQLite rows (written by an older version of the app, or altered), the item read from the keychain. A wrong shape must become a controlled failure, not a crash three screens away. At the same time the domain must stay free of any package.

## Decision

`zod` validates shapes where data crosses into the app, and nowhere else. A lint policy lets only the infrastructure folders import it.

- Wire data: one schema per resource and a mapper to and from the domain (the `dto` folders of the infrastructure).
- Stored data: the cache keeps its own format (`storedMeeting.ts`, `storedDocument.ts`), not the DTOs of the API, so a change of the API cannot make the rows on the devices unreadable; the outbox rows and the session item of the secure storage are checked the same way.
- The schema checks the shape (a field is there, with the type of the API, unknown fields ignored). The values are checked by the factories of the domain (`createMeeting`, `parseMeetingId`, `createCredentials`), which exist with or without zod. A status nobody knows, a blank title or a duplicate id is as invalid as a missing field.
- A failure is `unexpected` for the use cases, and the monitoring gets the paths of the fields that failed (`agenda.0.status`), never their values.

## Consequences

- The domain and the application hold no schema library, and the rules are the same whatever the source of the data.
- Every external format is written twice, as a schema and as a mapper. In exchange a change on one side of a boundary is a change in one adapter.
- Validation costs run time on each answer; the answers are small (a hard cap of 2 MiB for JSON).
- The reader must remember the split: zod for the shape, the domain for the meaning.

## Alternatives considered

- **zod in the domain**, as the single source of types. Fewer files, and a package in the layer that must have none; the domain would also be shaped by the wire format.
- **Trust the types of the API.** Cheapest, and a malformed answer or an altered row becomes an exception in a screen.
- **Hand-written guards.** No dependency; long, repetitive, and no paths for the diagnostics.
- **valibot, io-ts, yup.** Comparable; zod was chosen for its familiarity and its error paths.
