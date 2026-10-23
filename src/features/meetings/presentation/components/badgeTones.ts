import type { BadgeTone } from '@core/presentation/components/Badge';
import { CONFIDENTIALITY_LEVEL } from '@features/meetings/domain/entities/Document';
import type { ConfidentialityLevel } from '@features/meetings/domain/entities/Document';
import { VOTING_STATE } from '@features/meetings/domain/policies/votingState';
import type { VotingState } from '@features/meetings/domain/policies/votingState';

// The colour of the badge of each code. Each map is typed over the whole set of its codes, so a
// level or a state added to the domain without a tone fails the typecheck here, instead of
// silently taking the neutral one.

export const CONFIDENTIALITY_TONES = {
  [CONFIDENTIALITY_LEVEL.Public]: 'neutral',
  [CONFIDENTIALITY_LEVEL.Internal]: 'neutral',
  [CONFIDENTIALITY_LEVEL.Confidential]: 'confidential',
} as const satisfies Record<ConfidentialityLevel, BadgeTone>;

export const VOTING_STATE_TONES = {
  [VOTING_STATE.Open]: 'positive',
  [VOTING_STATE.Closed]: 'neutral',
  [VOTING_STATE.WindowOver]: 'neutral',
} as const satisfies Record<VotingState, BadgeTone>;
