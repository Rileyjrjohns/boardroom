import type { MeetingRepository } from '@features/meetings/application/ports/MeetingRepository';

import type { InMemoryBackend } from './InMemoryBackend';

/** The meetings of the simulated server. A thin window on the backend it shares with the others. */
export class InMemoryMeetingRepository implements MeetingRepository {
  constructor(private readonly backend: InMemoryBackend) {}

  list(...args: Parameters<MeetingRepository['list']>): ReturnType<MeetingRepository['list']> {
    return this.backend.listMeetings(...args);
  }

  get(...args: Parameters<MeetingRepository['get']>): ReturnType<MeetingRepository['get']> {
    return this.backend.getMeeting(...args);
  }
}
