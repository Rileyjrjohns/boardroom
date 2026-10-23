import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import { aResolution, anAgendaItemId, unwrap } from '@testing/domain/builders';

import { createAgendaItem } from './AgendaItem';

const VALID = { id: anAgendaItemId(), position: 1, title: 'Budget' };

describe('createAgendaItem', () => {
  it('builds an item with neither description nor resolution', () => {
    const item = unwrap(createAgendaItem(VALID));

    expect(item).toEqual(VALID);
    expect(item).not.toHaveProperty('description');
    expect(item).not.toHaveProperty('resolution');
  });

  it('keeps a trimmed description and the resolution', () => {
    const resolution = aResolution();

    expect(createAgendaItem({ ...VALID, description: ' Context ', resolution })).toEqual(
      ok({ ...VALID, description: 'Context', resolution }),
    );
  });

  it('treats a blank description as none', () => {
    expect(unwrap(createAgendaItem({ ...VALID, description: '  ' }))).not.toHaveProperty(
      'description',
    );
  });

  it('rejects a blank title', () => {
    expect(createAgendaItem({ ...VALID, title: '' })).toEqual(
      err(validationError(VALIDATION_FIELD.Title, VALIDATION_RULE.Required)),
    );
  });

  it('rejects a description that is too long', () => {
    expect(createAgendaItem({ ...VALID, description: 'a'.repeat(5001) })).toEqual(
      err(validationError(VALIDATION_FIELD.Description, VALIDATION_RULE.TooLong)),
    );
  });

  it.each([
    [0, VALIDATION_RULE.OutOfRange],
    [1001, VALIDATION_RULE.OutOfRange],
    [1.5, VALIDATION_RULE.NotAnInteger],
  ])('rejects the position %p', (position, rule) => {
    expect(createAgendaItem({ ...VALID, position })).toEqual(
      err(validationError(VALIDATION_FIELD.Position, rule)),
    );
  });
});
