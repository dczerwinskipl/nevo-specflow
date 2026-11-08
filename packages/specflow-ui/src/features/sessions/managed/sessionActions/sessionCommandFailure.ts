import type { SessionSnapshot } from '@nevo/specflow-contracts/sessions';
import { isApiError } from '../../../../api';
import { writeOutcomeUnknown } from '../../../../shared/http/apiErrorCode';
import { sessionErrorCode } from '../api';

/**
 * What a failed Session command means for its dialog (full-session-screen-structure §22.1):
 * - `unconfirmed`: the answer was lost; the dialog stays locked and the confirm retries;
 * - `forbidden`, `turnConflict`, `deleteBlocked`, `refused`: definite refusals that unlock Cancel.
 */
export type SessionCommandFailure =
  'unconfirmed' | 'forbidden' | 'turnConflict' | 'deleteBlocked' | 'refused';

export function sessionCommandFailure(error: unknown): SessionCommandFailure {
  const code = sessionErrorCode(error);
  if (code === 'TURN_CONFLICT') {
    return 'turnConflict';
  }

  if (code === 'SESSION_DELETE_BLOCKED') {
    return 'deleteBlocked';
  }

  if (isApiError(error) && error.kind === 'forbidden') {
    return 'forbidden';
  }

  return writeOutcomeUnknown(error) ? 'unconfirmed' : 'refused';
}

/** The reason an Archive or Delete cannot be confirmed while a Turn has not ended (full-session-screen-structure §22.1). */
export type TurnBlockNote = 'turnActive' | 'turnWaitingForUser' | 'turnUnknown';

export function turnBlockNote(
  state: NonNullable<SessionSnapshot['activeTurn']>['state'],
): TurnBlockNote {
  switch (state) {
    case 'waitingForUser':
      return 'turnWaitingForUser';
    case 'unknown':
      return 'turnUnknown';
    default:
      return 'turnActive';
  }
}
