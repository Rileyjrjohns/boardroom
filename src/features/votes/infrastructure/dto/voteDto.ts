import { z } from 'zod';

import type { ValidationError } from '@core/domain/errors/ValidationError';
import { andThen, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { parseInstant } from '@core/domain/value-objects/Instant';
import { parseMeetingId, parseResolutionId, parseUserId } from '@core/domain/value-objects/ids';
import { isoInstantSchema, toIsoString } from '@core/infrastructure/http/dto/wire';
import { parseVoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';
import { createVote } from '@features/votes/domain/entities/Vote';
import type { Vote } from '@features/votes/domain/entities/Vote';

// Casting a vote: `POST /votes`. The answer carries no body; a business rejection is a 422 whose
// body is described in `shared/rejectionSchemas.ts`.

export const voteRequestSchema = z.object({
  resolutionId: z.string(),
  meetingId: z.string(),
  voterId: z.string(),
  choice: z.string(),
  /** When the voter chose, on the clock of their device. The server does not trust it. */
  castAt: isoInstantSchema,
});

export type VoteRequestWire = z.input<typeof voteRequestSchema>;

export function toVoteRequestWire(vote: Vote): VoteRequestWire {
  return {
    resolutionId: vote.resolutionId,
    meetingId: vote.meetingId,
    voterId: vote.voterId,
    choice: vote.choice,
    castAt: toIsoString(vote.castAt),
  };
}

/** The vote a request carries, through the factories of the domain: what the server reads. */
export function toVote(wire: z.output<typeof voteRequestSchema>): Result<Vote, ValidationError> {
  return andThen(parseResolutionId(wire.resolutionId), (resolutionId) =>
    andThen(parseMeetingId(wire.meetingId), (meetingId) =>
      andThen(parseUserId(wire.voterId), (voterId) =>
        andThen(parseVoteChoice(wire.choice), (choice) =>
          andThen(parseInstant(wire.castAt), (castAt) =>
            ok(createVote({ resolutionId, meetingId, voterId, choice, castAt })),
          ),
        ),
      ),
    ),
  );
}
