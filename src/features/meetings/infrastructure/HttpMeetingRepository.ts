import type { Monitoring } from '@core/application/ports/Monitoring';
import type { GatewayError, RepositoryError } from '@core/domain/errors/RepositoryError';
import { err } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Page } from '@core/domain/value-objects/Page';
import type { PageRequest } from '@core/domain/value-objects/PageRequest';
import type { MeetingId } from '@core/domain/value-objects/ids';
import type { HttpClient } from '@core/infrastructure/http/HttpClient';
import { asGatewayError, asRepositoryError } from '@core/infrastructure/http/gatewayErrors';
import { domainViolation, HTTP_RESOURCE } from '@core/infrastructure/http/invalidResponse';
import { HTTP_METHOD, QUERY_PARAMETER, ROUTES } from '@core/infrastructure/http/protocol';
import type { MeetingRepository } from '@features/meetings/application/ports/MeetingRepository';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

import { meetingPageSchema, meetingSchema, toMeeting, toMeetingPage } from './dto/meetingDto';

/**
 * The meetings of the API (`GET /meetings`, `GET /meetings/{id}`). The request is given to the
 * client as a function, so that the route, which is made of an identifier, is built where the
 * client can catch a failure: an adapter never throws.
 */
export class HttpMeetingRepository implements MeetingRepository {
  constructor(
    private readonly client: HttpClient,
    private readonly monitoring: Monitoring,
  ) {}

  async list(
    period: MeetingPeriod,
    request: PageRequest,
  ): Promise<Result<Page<MeetingSummary>, GatewayError>> {
    const answer = await this.client.request(() => ({
      method: HTTP_METHOD.Get,
      path: ROUTES.meetings,
      query: {
        [QUERY_PARAMETER.Period]: period,
        [QUERY_PARAMETER.Limit]: request.limit,
        [QUERY_PARAMETER.Cursor]: request.cursor,
      },
      resource: HTTP_RESOURCE.MeetingPage,
      schema: meetingPageSchema,
    }));
    if (!answer.ok) return err(asGatewayError(answer.error));

    const page = toMeetingPage(answer.value);
    return page.ok
      ? page
      : err(domainViolation(this.monitoring, HTTP_RESOURCE.MeetingPage, page.error));
  }

  async get(id: MeetingId): Promise<Result<Meeting, RepositoryError>> {
    const answer = await this.client.request(() => ({
      method: HTTP_METHOD.Get,
      path: ROUTES.meeting(id),
      resource: HTTP_RESOURCE.Meeting,
      schema: meetingSchema,
    }));
    if (!answer.ok) return err(asRepositoryError(answer.error));

    const meeting = toMeeting(answer.value);
    return meeting.ok
      ? meeting
      : err(domainViolation(this.monitoring, HTTP_RESOURCE.Meeting, meeting.error));
  }
}
