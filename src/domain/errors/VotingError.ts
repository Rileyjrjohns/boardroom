import type { ResolutionId } from '../value-objects/ids';
import type { ValueOf } from '../shared/constants';
import { valuesOf } from '../shared/constants';

/** Why a vote cannot be cast. The same reasons come back from the remote source when it rejects one. */
export const VOTING_ERROR_CODE = {
  ResolutionNotFound: 'resolutionNotFound',
  NotAParticipant: 'notAParticipant',
  NoVotingRights: 'noVotingRights',
  ResolutionClosed: 'resolutionClosed',
  VotingWindowOver: 'votingWindowOver',
  AlreadyVoted: 'alreadyVoted',
} as const;

/** Where the earlier vote of the voter is. */
export const ALREADY_VOTED_SOURCE = {
  /** The remote source holds it (it is part of the meeting). */
  Recorded: 'recorded',
  /** It waits in the outbox to be sent. */
  Queued: 'queued',
} as const;

export type AlreadyVotedSource = ValueOf<typeof ALREADY_VOTED_SOURCE>;

/** The meeting has no such resolution. */
export interface ResolutionNotFoundError {
  readonly code: typeof VOTING_ERROR_CODE.ResolutionNotFound;
  readonly resolutionId: ResolutionId;
}

/** The voter is not invited to the meeting. */
export interface NotAParticipantError {
  readonly code: typeof VOTING_ERROR_CODE.NotAParticipant;
}

/** The voter takes part in the meeting without the right to vote (a secretary, a guest). */
export interface NoVotingRightsError {
  readonly code: typeof VOTING_ERROR_CODE.NoVotingRights;
}

/** The resolution is closed. */
export interface ResolutionClosedError {
  readonly code: typeof VOTING_ERROR_CODE.ResolutionClosed;
}

/** The resolution is still marked open, but its closing instant has been reached. */
export interface VotingWindowOverError {
  readonly code: typeof VOTING_ERROR_CODE.VotingWindowOver;
}

/** A vote is final: the voter has already voted on this resolution. */
export interface AlreadyVotedError {
  readonly code: typeof VOTING_ERROR_CODE.AlreadyVoted;
  readonly source: AlreadyVotedSource;
}

export type VotingError =
  | ResolutionNotFoundError
  | NotAParticipantError
  | NoVotingRightsError
  | ResolutionClosedError
  | VotingWindowOverError
  | AlreadyVotedError;

const VOTING_ERROR_CODES: ReadonlySet<string> = new Set(valuesOf(VOTING_ERROR_CODE));

/**
 * Tells a business rejection of a vote from the other errors of a union. In a union such as
 * `GatewayError | VotingError`, the true branch narrows to the voting errors and the false branch
 * to the rest.
 */
export function isVotingError<E extends { readonly code: string }>(
  error: E,
): error is Extract<E, VotingError> {
  return VOTING_ERROR_CODES.has(error.code);
}
