import { findConstant, valuesOf } from './constants';

const COLOURS = { Red: 'red', Green: 'green' } as const;

describe('constants helpers', () => {
  it('lists the values of a const object', () => {
    expect(valuesOf(COLOURS)).toEqual(['red', 'green']);
  });

  it('finds the member of a list that equals a raw string', () => {
    expect(findConstant(valuesOf(COLOURS), 'green')).toBe('green');
  });

  it('does not take a longer string for a member that is only its beginning', () => {
    const choices = valuesOf({ For: 'for', Against: 'against' } as const);

    expect(findConstant(choices, 'forward')).toBeUndefined();
    expect(findConstant(choices, 'fo')).toBeUndefined();
    expect(findConstant(choices, 'againstit')).toBeUndefined();
    expect(findConstant(choices, ' for')).toBeUndefined();
  });

  it('returns undefined for a raw string that is not a member', () => {
    expect(findConstant(valuesOf(COLOURS), 'blue')).toBeUndefined();
    expect(findConstant(valuesOf(COLOURS), 'Red')).toBeUndefined();
  });
});
