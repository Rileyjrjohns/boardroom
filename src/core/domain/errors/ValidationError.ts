import type { ValueOf } from '../shared/constants';

/** The input a validation rule was applied to. Presentation maps it to a form field or a label. */
export const VALIDATION_FIELD = {
  UserId: 'userId',
  MeetingId: 'meetingId',
  AgendaItemId: 'agendaItemId',
  ResolutionId: 'resolutionId',
  DocumentId: 'documentId',
  FullName: 'fullName',
  Email: 'email',
  Password: 'password',
  Title: 'title',
  Description: 'description',
  Location: 'location',
  Position: 'position',
  PageCount: 'pageCount',
  PageLimit: 'pageLimit',
  PageCursor: 'pageCursor',
  Instant: 'instant',
  Duration: 'duration',
  DocumentLocation: 'documentLocation',
  AttemptCount: 'attemptCount',
  Agenda: 'agenda',
  Documents: 'documents',
  Participants: 'participants',
  VoteChoice: 'voteChoice',
  MeetingPeriod: 'meetingPeriod',
  ParticipantRole: 'participantRole',
  ResolutionStatus: 'resolutionStatus',
  ConfidentialityLevel: 'confidentialityLevel',
} as const;

export type ValidationField = ValueOf<typeof VALIDATION_FIELD>;

/** The rule that a value broke. */
export const VALIDATION_RULE = {
  /** Empty, blank or missing. */
  Required: 'required',
  TooLong: 'tooLong',
  InvalidFormat: 'invalidFormat',
  NotAnInteger: 'notAnInteger',
  OutOfRange: 'outOfRange',
  /** Not a member of a closed set of values. */
  UnknownValue: 'unknownValue',
  /** Two members of a collection that must be unique share an identity. */
  Duplicate: 'duplicate',
} as const;

export type ValidationRule = ValueOf<typeof VALIDATION_RULE>;

export const VALIDATION_ERROR_CODE = { Validation: 'validation' } as const;

/** A value broke an invariant: which input, which rule. Carries no text. */
export interface ValidationError {
  readonly code: typeof VALIDATION_ERROR_CODE.Validation;
  readonly field: ValidationField;
  readonly rule: ValidationRule;
}

export function validationError(field: ValidationField, rule: ValidationRule): ValidationError {
  return { code: VALIDATION_ERROR_CODE.Validation, field, rule };
}
