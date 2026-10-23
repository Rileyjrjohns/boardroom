import { z } from 'zod';

import { isoInstantSchema } from '@core/infrastructure/http/dto/wire';
import { userSchema } from '@features/auth/infrastructure/dto/sessionDto';
import { meetingSchema } from '@features/meetings/infrastructure/dto/meetingDto';
import { voteRequestSchema } from '@features/votes/infrastructure/dto/voteDto';

// The files of docs/spec/fixtures (see docs/spec/fixtures/README.md). Every file is an object whose
// `referenceDate` comes first. What the HTTP API has an equivalent for is read with the schema of
// the API (docs/api.md, the `dto` folders of the features): a meeting is a `GET /meetings/{id}`
// answer, a recorded vote is the body of `POST /votes`, a user is the `user` of a sign-in answer.
// What the API does not expose (the accounts and their password, the votes already recorded) is
// described here and nowhere else. Like the API schemas, these check that each field is there and
// has the right type, ignore the fields they do not know, and leave the values to the domain
// factories.

/** The instant every date of the files is relative to. */
const referenceDate = isoInstantSchema;

export const accountsFileSchema = z.object({
  referenceDate,
  /** The accounts that can sign in, with the password of the simulation. */
  accounts: z.array(z.object({ user: userSchema, password: z.string() })),
  /** The account that is signed in at start by the mock configuration. */
  demoUserId: z.string(),
});

export const meetingsFileSchema = z.object({
  referenceDate,
  meetings: z.array(meetingSchema),
});

export const recordedVotesFileSchema = z.object({
  referenceDate,
  recordedVotes: z.array(voteRequestSchema),
});
