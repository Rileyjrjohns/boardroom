import type { Meeting } from '@domain/entities/Meeting';
import type { SessionChangedError } from '@domain/errors/AuthenticationError';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { isErr } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { MeetingId } from '@domain/value-objects/ids';

import type { Loaded } from '../../shared/Loaded';
import { loadMeeting } from '../../shared/loadMeeting';
import type { LoadMeetingDeps } from '../../shared/loadMeeting';
import { requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';

export type GetMeetingDeps = LoadMeetingDeps;

export interface GetMeetingInput {
  readonly meetingId: MeetingId;
}

export type GetMeetingError = SessionRequiredError | SessionChangedError | RepositoryError;

/**
 * A meeting with its agenda, documents and participants. Requires a valid session, like
 * `ListMeetings`, and follows the same offline policy: fresh from the server, or the cached copy
 * of the signed-in user flagged stale when there is no network. A refusal of the session
 * (`unauthorized`) empties both caches; a refusal of the meeting (`forbidden`, `notFound`) removes
 * the cached copy and the documents it lists. If the user changed while the request was in
 * flight, nothing is written and the answer is `sessionChanged`.
 */
export class GetMeeting {
  constructor(private readonly deps: GetMeetingDeps) {}

  async execute(input: GetMeetingInput): Promise<Result<Loaded<Meeting>, GetMeetingError>> {
    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    return loadMeeting(this.deps, session.value.user.id, input.meetingId);
  }
}
