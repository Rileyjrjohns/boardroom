import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { GatewayError, RepositoryError } from '@domain/errors/RepositoryError';
import { err } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { MeetingId } from '@domain/value-objects/ids';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { Page } from '@domain/value-objects/Page';
import type { PageRequest } from '@domain/value-objects/PageRequest';
import type { Monitoring } from '@application/ports/Monitoring';
import type { MeetingRepository } from '@application/ports/MeetingRepository';

import { asGatewayError, asRepositoryError } from './gatewayErrors';
import type { HttpClient } from './HttpClient';
import { domainViolation, HTTP_RESOURCE } from './invalidResponse';
import { meetingPageSchema, meetingSchema, toMeeting, toMeetingPage } from './dto/meetingDto';
import { HTTP_METHOD, QUERY_PARAMETER, ROUTES } from './protocol';

/** The meetings of the API (`GET /meetings`, `GET /meetings/{id}`). */
export class HttpMeetingRepository implements MeetingRepository {
  constructor(
    private readonly client: HttpClient,
    private readonly monitoring: Monitoring,
  ) {}

  async list(
    period: MeetingPeriod,
    request: PageRequest,
  ): Promise<Result<Page<MeetingSummary>, GatewayError>> {
    const answer = await this.client.request({
      method: HTTP_METHOD.Get,
      path: ROUTES.meetings,
      query: {
        [QUERY_PARAMETER.Period]: period,
        [QUERY_PARAMETER.Limit]: request.limit,
        [QUERY_PARAMETER.Cursor]: request.cursor,
      },
      resource: HTTP_RESOURCE.MeetingPage,
      schema: meetingPageSchema,
    });
    if (!answer.ok) return err(asGatewayError(answer.error));

    const page = toMeetingPage(answer.value);
    return page.ok
      ? page
      : err(domainViolation(this.monitoring, HTTP_RESOURCE.MeetingPage, page.error));
  }

  async get(id: MeetingId): Promise<Result<Meeting, RepositoryError>> {
    const answer = await this.client.request({
      method: HTTP_METHOD.Get,
      path: ROUTES.meeting(id),
      resource: HTTP_RESOURCE.Meeting,
      schema: meetingSchema,
    });
    if (!answer.ok) return err(asRepositoryError(answer.error));

    const meeting = toMeeting(answer.value);
    return meeting.ok
      ? meeting
      : err(domainViolation(this.monitoring, HTTP_RESOURCE.Meeting, meeting.error));
  }
}
