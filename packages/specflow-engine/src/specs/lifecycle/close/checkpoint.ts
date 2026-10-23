import { isDeepStrictEqual } from 'node:util';

import type { SpecFlowEngine } from '../../../application';
import { withProjectControlLock } from '../../../project/control-lock';
import { publishCloseJournal, readCloseJournal } from '../journal/store';
import { CloseOperationError, type CloseJournal, type CloseOperationErrorCode } from '../model';

/**
 * Close-only journal compare-and-publish. All eligibility checks supplied by
 * the phase execute under the same Project Home lock as the journal CAS.
 *
 * Never perform Git, filesystem effects, or process waits in verifyCurrent.
 * Their physical proofs belong before this checkpoint or to later recovery.
 */
export async function publishCloseCheckpoint(
  engine: SpecFlowEngine,
  expected: CloseJournal,
  next: CloseJournal,
  guard: {
    readonly onConflict: string;
    readonly onConflictCode?: CloseOperationErrorCode;
    readonly onReadbackFailure: string;
    readonly verifyCurrent?: (current: CloseJournal) => Promise<void>;
  },
): Promise<CloseJournal> {
  if (
    next.plan.operationId !== expected.plan.operationId ||
    next.projectId !== expected.projectId ||
    next.gitInstanceId !== expected.gitInstanceId
  ) {
    throw new CloseOperationError('CLOSE_CONFLICT', 'Close checkpoint identity changed.');
  }
  return withProjectControlLock(engine.context, async () => {
    const current = await readCloseJournal(engine.context, expected.plan.operationId);
    if (!current || !isDeepStrictEqual(current, expected)) {
      throw new CloseOperationError(guard.onConflictCode ?? 'CLOSE_CONFLICT', guard.onConflict);
    }
    await guard.verifyCurrent?.(current);
    await publishCloseJournal(engine.context, next);
    const recorded = await readCloseJournal(engine.context, expected.plan.operationId);
    if (!recorded || !isDeepStrictEqual(recorded, next)) {
      throw new CloseOperationError('CLOSE_RECOVERY_REQUIRED', guard.onReadbackFailure);
    }
    return recorded;
  });
}
