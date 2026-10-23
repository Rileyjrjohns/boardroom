import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import { NOW, aMeetingId } from '@testing/domain/builders';

import { createMeetingSummary } from './MeetingSummary';

const VALID = { id: aMeetingId(), title: 'Board', scheduledAt: NOW, location: 'Room 1' };

describe('createMeetingSummary', () => {
  it('builds a summary with trimmed texts', () => {
    expect(createMeetingSummary({ ...VALID, title: ' Board ', location: ' Room 1 ' })).toEqual(
      ok(VALID),
    );
  });

  it('rejects a blank title, then a blank location', () => {
    expect(createMeetingSummary({ ...VALID, title: '', location: '' })).toEqual(
      err(validationError(VALIDATION_FIELD.Title, VALIDATION_RULE.Required)),
    );
    expect(createMeetingSummary({ ...VALID, location: ' ' })).toEqual(
      err(validationError(VALIDATION_FIELD.Location, VALIDATION_RULE.Required)),
    );
  });
});
