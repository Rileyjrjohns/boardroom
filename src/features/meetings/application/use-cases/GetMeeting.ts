import type { Loaded } from '@core/application/offline/Loaded';
import type { SessionChangedError } from '@core/domain/errors/AuthenticationError';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import { isErr } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { MeetingId } from '@core/domain/value-objects/ids';
import { requireSession } from '@features/auth/application/session/requireSession';
import type { SessionRequiredError } from '@features/auth/application/session/requireSession';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';

import { loadMeeting } from '../loadMeeting';
import type { LoadMeetingDeps } from '../loadMeeting';

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
