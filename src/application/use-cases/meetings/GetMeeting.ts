import type { Meeting } from '@domain/entities/Meeting';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { isErr } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { MeetingId } from '@domain/value-objects/ids';

import type { AuthSession } from '../../ports/AuthSession';
import type { Loaded } from '../../shared/Loaded';
import { loadMeeting } from '../../shared/loadMeeting';
import type { LoadMeetingDeps } from '../../shared/loadMeeting';
import { requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';

export interface GetMeetingDeps extends LoadMeetingDeps {
  readonly auth: AuthSession;
}

export interface GetMeetingInput {
  readonly meetingId: MeetingId;
}

export type GetMeetingError = SessionRequiredError | RepositoryError;

/**
 * A meeting with its agenda, documents and participants. Requires a valid session, like
 * `ListMeetings`, and follows the same offline policy: fresh from the server, or the cached copy
 * of the signed-in user flagged stale when there is no network. A refusal of the server
 * (`unauthorized`, `notFound`) evicts the cached copy.
 */
export class GetMeeting {
  constructor(private readonly deps: GetMeetingDeps) {}

  async execute(input: GetMeetingInput): Promise<Result<Loaded<Meeting>, GetMeetingError>> {
    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    return loadMeeting(this.deps, session.value.user.id, input.meetingId);
  }
}
