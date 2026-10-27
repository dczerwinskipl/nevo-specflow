import type { SpecFlowEngine } from '../../../application';
import {
  takeOverProjectControlLock,
  type ControlLockTakeoverOptions,
  type ControlLockTakeoverResult,
} from '../../../project/control-lock-takeover';
import { resumeDocumentChange } from '../api';
import { isWriterStage } from '../changes/journal/stages';
import { resumeStoppedManualCommits, type ManualCommitResumeOutcome } from '../manual-commit';
import { checkoutsOfJournals } from '../queue/flush';
import type {
  QueueCheckout,
  QueueDependencies,
  QueueOptions,
  QueueRunResult,
} from '../queue/types';
import { drainQueue } from '../queue/worker';
import { listDocumentChangeJournals } from '../write/journal-store';
import type { DocumentWriteOptions } from '../write/writer-types';

export interface DocumentQueueTakeoverOptions {
  /**
   * The operator's assertion that the Runtime or CLI process that ran the document queue has
   * stopped (the CLI flag `--confirmed-stopped`). Required. Never set by a transport.
   */
  readonly confirmExecutorStopped: boolean;
  /** Restrict the takeover to one checkout. */
  readonly workspaceId?: string;
  /** Seams of the control-lock takeover (tests). */
  readonly lock?: Omit<ControlLockTakeoverOptions, 'confirmExecutorStopped'>;
  readonly queue?: QueueDependencies;
  readonly queueOptions?: Omit<QueueOptions, 'flush' | 'confirmExecutorStopped'>;
  readonly write?: DocumentWriteOptions;
}

export interface DocumentQueueTakeoverResult {
  readonly lock: ControlLockTakeoverResult;
  /** Interrupted writes that were rolled forward or refused, in journal order. */
  readonly writes: readonly {
    readonly operationId: string;
    readonly outcome: 'resumed' | 'refused';
    readonly code?: string;
  }[];
  /** Manual commits a stopped CLI left holding a checkout, resumed or refused. */
  readonly manualCommits: readonly ManualCommitResumeOutcome[];
  readonly passes: readonly {
    readonly workspaceId: string;
    readonly results: readonly QueueRunResult[];
  }[];
}

/**
 * The operator command behind `specs documents recover --confirmed-stopped` and its Runtime
 * counterpart: the answer to "a crashed Runtime leaves the document queue busy" where the Engine
 * cannot prove the dead holder by itself (Windows, macOS, containers without procfs).
 *
 * 1. The Project Home control lock is cleared if, and only if, `takeOverProjectControlLock` proves
 *    its conditions (never a live holder, never a lock this process holds). A refusal ends the
 *    command: nothing else is touched, because every later step needs that lock.
 * 2. Interrupted writes (`reserved`, `files-writing`) are rolled forward on the assertion.
 * 3. Manual commits that stopped holding a checkout (`reserved`, `committing`) are resumed on the assertion.
 * 4. Every checkout with queue work is drained with `flush` and the assertion: a lease or a
 *    `committing` batch whose executor cannot be proven dead is taken over; a live one is reported
 *    `busy` and left alone.
 *
 * The assertion is the operator's responsibility; the Engine adds only the proofs it can make.
 */
export async function takeOverDocumentQueue(
  engine: SpecFlowEngine,
  options: DocumentQueueTakeoverOptions,
): Promise<DocumentQueueTakeoverResult> {
  const lock = await takeOverProjectControlLock(engine.context, {
    ...options.lock,
    confirmExecutorStopped: options.confirmExecutorStopped,
  });
  if (lock.status === 'refused') return { lock, writes: [], manualCommits: [], passes: [] };

  const writes: DocumentQueueTakeoverResult['writes'][number][] = [];
  for (const journal of await listDocumentChangeJournals(engine.context)) {
    if (!isWriterStage(journal.stage)) continue;
    if (options.workspaceId !== undefined && journal.workspaceId !== options.workspaceId) continue;
    try {
      await resumeDocumentChange(engine, journal.operationId, {
        ...options.write,
        confirmWriterStopped: true,
      });
      writes.push({ operationId: journal.operationId, outcome: 'resumed' });
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      writes.push({
        operationId: journal.operationId,
        outcome: 'refused',
        ...(typeof code === 'string' ? { code } : {}),
      });
    }
  }

  const manualCommits = await resumeStoppedManualCommits(engine, {
    ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
    confirmExecutorStopped: true,
  });

  const checkouts: QueueCheckout[] = checkoutsOfJournals(
    await listDocumentChangeJournals(engine.context),
  ).filter(
    (checkout) => options.workspaceId === undefined || checkout.workspaceId === options.workspaceId,
  );
  const passes: DocumentQueueTakeoverResult['passes'][number][] = [];
  for (const checkout of checkouts) {
    passes.push({
      workspaceId: checkout.workspaceId,
      results: await drainQueue(engine, options.queue ?? {}, checkout, {
        ...options.queueOptions,
        flush: true,
        confirmExecutorStopped: true,
      }),
    });
  }
  return { lock, writes, manualCommits, passes };
}
