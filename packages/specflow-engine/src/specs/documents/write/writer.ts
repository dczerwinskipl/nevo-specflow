import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../../application';
import { sha256Hex } from '../../../hash';
import { DocumentError } from '../../document-rules/errors';
import { readPayload, validateJournalOperationId } from '../../durable';
import { commitInfoOfJournal } from '../changes/commit-info';
import { documentChangeError, DOCUMENT_CHANGE_CAUSES } from '../changes/errors';
import { fingerprintDocumentChange } from '../changes/fingerprint';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import type { DocumentChangePlan } from '../changes/plan/model';
import type { DocumentWriteRequest } from '../changes/plan/request';
import { admitDocumentChange, type AdmittedDocumentChange } from './admission';
import { proveExecutorState, captureExecutorIdentity, nodeProcessTable } from './executor-identity';
import { WriterInterrupted, nodeDocumentFileOps } from './file-effects';
import {
  JournalMovedError,
  findDocumentChangeJournal,
  settleDocumentChangeJournal,
} from './journal-store';
import { reserveOnce } from './reservation';
import { BUSY_RETRY_AFTER_MS } from './reservation-guard';
import {
  claimWrite,
  finishAcknowledged,
  isErrno,
  rollForward,
  skipUnlessCut,
  writeCauseOf,
} from './write-phase';
import {
  NO_BATCHES,
  resultOf,
  type DocumentChangeResult,
  type DocumentWriteDependencies,
  type DocumentWriteOptions,
  type WriteRuntime,
} from './writer-types';

const DEFAULT_RETRIES = { count: 3, delayMs: 100 } as const;
const DEFAULT_BUSY_WAIT_MS = 5000;
const BUSY_POLL_MS = 100;

/**
 * Operations of this process that are being worked on: one at a time per operation id. The map is
 * keyed on the global symbol registry, so a second copy of this module in the process (a duplicated
 * package, a test harness) shares it. Another thread of the process has its own realm: there the
 * compare-and-replace of the executor in the journal and the per-executor stage names are what keep
 * two writers from tearing a file.
 */
const IN_FLIGHT = Symbol.for('nevo.specflow.engine.documentWrites.inFlight');
const inFlight: Map<string, Promise<unknown>> = ((globalThis as Record<symbol, unknown>)[
  IN_FLIGHT
] ??= new Map<string, Promise<unknown>>()) as Map<string, Promise<unknown>>;

async function serialized<T>(operationId: string, run: () => Promise<T>): Promise<T> {
  const before = inFlight.get(operationId) ?? Promise.resolve();
  const current = before.catch(() => undefined).then(run);
  inFlight.set(operationId, current);
  try {
    return await current;
  } finally {
    if (inFlight.get(operationId) === current) {
      inFlight.delete(operationId);
    }
  }
}

export function createWriteRuntime(
  engine: SpecFlowEngine,
  deps: DocumentWriteDependencies,
  options: DocumentWriteOptions = {},
): WriteRuntime {
  let captured = options.executor;
  const now = options.now ?? (() => new Date());
  // Five hexadecimal characters that make the stage files of this call its own.
  const executorTag = sha256Hex(randomUUID()).slice(0, 5);

  return {
    engine,
    context: engine.context,
    deps,
    options,
    files: options.files ?? nodeDocumentFileOps,
    hooks: options.hooks ?? {},
    batches: options.batches ?? NO_BATCHES,
    executorTag,
    retries: options.retries ?? DEFAULT_RETRIES,
    busyWaitMs: options.busyWaitMs ?? DEFAULT_BUSY_WAIT_MS,
    now,
    nowIso: () => now().toISOString(),
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    executor: async () => {
      captured ??= await captureExecutorIdentity(options.processTable ?? nodeProcessTable);

      return captured;
    },
  };
}

/**
 * A write that is not a refusal and not a simulated cut becomes a typed failure: a full disk or an
 * I/O error is `DOCUMENT_WRITE_FAILED` (503). The journal stays as it is, which is a state a replay
 * continues from.
 */
function asWriteFailure(error: unknown): unknown {
  if (error instanceof AdmissionFailure) {
    return error.original;
  }

  if (
    error instanceof DocumentError ||
    error instanceof WriterInterrupted ||
    error instanceof JournalMovedError
  ) {
    return error;
  }

  // Whatever else the write or the journal raised (an errno, a lock that stayed busy, a record that
  // could not be written) is a failure of the write, never a raw server error.
  return documentChangeError(
    isErrno(error) ? writeCauseOf(error) : 'write-io-error',
    'Writing the documents failed.',
  );
}

/** An error of admission, which keeps its own meaning and is not a failure of the write. */
class AdmissionFailure extends Error {
  readonly original: unknown;

  constructor(original: unknown) {
    super('Admission failed.');
    this.name = 'AdmissionFailure';
    this.original = original;
  }
}

/**
 * A document change, end to end (ADR 0016). Nothing is written before the
 * request passed admission; the answer comes when the files are in place and the journal is `queued`
 * (Git enabled: `commit.state: pending`) or `completed` (Git disabled: `not-applicable`).
 *
 * The same `operationId` is a replay: an equal request returns the stored result with the CURRENT
 * commit state and writes nothing more; a replay of an operation whose write was interrupted
 * (`reserved`, `files-writing`, `recovery-required` in its write phase) rolls it forward; a different
 * request is `DOCUMENT_OPERATION_CONFLICT`. Authorization is the caller's. With auto-commit off for
 * the documents (ADR 0018) the answer is `commit.state: uncommitted` at once: the paths are in the
 * ledger, nothing is queued.
 */
export async function writeDocumentChange(
  engine: SpecFlowEngine,
  deps: DocumentWriteDependencies,
  specId: string,
  operationId: string,
  request: DocumentWriteRequest,
  options: DocumentWriteOptions = {},
): Promise<DocumentChangeResult> {
  validateJournalOperationId(DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
  const rt = createWriteRuntime(engine, deps, options);
  const fingerprint = fingerprintDocumentChange(request);
  try {
    return await serialized(operationId, async () => {
      const existing = await findDocumentChangeJournal(rt.context, operationId);
      if (existing !== undefined) {
        return replayJournal(rt, existing, { specId, fingerprint });
      }

      return writeNew(rt, specId, operationId, request, fingerprint);
    });
  } catch (error) {
    throw asWriteFailure(error);
  }
}

/**
 * Continues an operation by its id alone: the stored result for an acknowledged one, a roll-forward
 * for one whose write was interrupted. This is the crash-recovery entry; it is the very function a
 * retried request goes through.
 */
export async function replayDocumentChange(
  engine: SpecFlowEngine,
  deps: DocumentWriteDependencies,
  operationId: string,
  options: DocumentWriteOptions = {},
): Promise<DocumentChangeResult> {
  validateJournalOperationId(DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
  const rt = createWriteRuntime(engine, deps, options);
  try {
    return await serialized(operationId, async () => {
      const existing = await findDocumentChangeJournal(rt.context, operationId);
      if (existing === undefined) {
        throw documentChangeError('operation-not-found', 'The document operation does not exist.');
      }

      return replayJournal(rt, existing, undefined);
    });
  } catch (error) {
    throw asWriteFailure(error);
  }
}

async function writeNew(
  rt: WriteRuntime,
  specId: string,
  operationId: string,
  request: DocumentWriteRequest,
  fingerprint: string,
): Promise<DocumentChangeResult> {
  let deadline: number | undefined;
  let admitted = await admit(rt, specId, request, 1);
  let replanned = false;
  await rt.hooks.beforeJournalWrite?.('reserved');
  for (let delay = BUSY_POLL_MS; ; delay = Math.min(delay * 2, 500)) {
    const outcome = await reserveOnce(rt, admitted, operationId, fingerprint);
    switch (outcome.kind) {
      case 'existing':
        return replayJournal(rt, outcome.journal, { specId, fingerprint });
      case 'replan':
        if (replanned) {
          throw documentChangeError(
            'busy-manifest-changed',
            'The registry is changing; retry shortly.',
            { retryAfterMs: BUSY_RETRY_AFTER_MS },
          );
        }

        replanned = true;
        admitted = await admit(rt, specId, request, 2);
        break;
      case 'busy':
        deadline ??= rt.now().getTime() + rt.busyWaitMs;
        if (!outcome.waitable || rt.now().getTime() + delay > deadline) {
          throw outcome.error;
        }

        await rt.sleep(delay);
        break;
      case 'reserved': {
        await rt.hooks.afterJournalWrite?.('reserved');

        return proceed(rt, outcome.journal, admitted.plan, false);
      }

      default: {
        const exhaustive: never = outcome;

        return exhaustive;
      }
    }
  }
}

async function admit(
  rt: WriteRuntime,
  specId: string,
  request: DocumentWriteRequest,
  attempt: number,
): Promise<AdmittedDocumentChange> {
  let admitted: AdmittedDocumentChange;
  try {
    admitted = await admitDocumentChange(rt.engine, specId, request, rt.options);
  } catch (error) {
    throw new AdmissionFailure(error);
  }

  await rt.hooks.afterAdmission?.(attempt);

  return admitted;
}

/** Rolls the write forward from `journal` and answers with the acknowledged state. */
async function proceed(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
  replayed: boolean,
): Promise<DocumentChangeResult> {
  try {
    const queued = journal.stage === 'queued' ? journal : await rollForward(rt, journal, plan);
    const settled = await finishAcknowledged(rt, queued);

    return resultOf(settled, plan, commitInfoOfJournal(settled, rt.now().getTime()), replayed);
  } catch (error) {
    if (error instanceof JournalMovedError) {
      // Another executor finished (or moved) the operation meanwhile: what is there now is the truth.
      return replayJournal(rt, error.current, undefined);
    }

    throw error;
  }
}

async function loadPlan(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
): Promise<DocumentChangePlan> {
  const text = await readPayload(
    rt.context,
    DOCUMENT_CHANGE_JOURNAL_KIND,
    journal.operationId,
    journal.plan,
  );

  return decodePlanWithEvidence(text, journal.plan);
}

/**
 * The answer for an operation that has a journal. `expected` is the request that asked (its Specification
 * and fingerprint must match); crash recovery passes none.
 */
async function replayJournal(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  expected: { readonly specId: string; readonly fingerprint: string } | undefined,
): Promise<DocumentChangeResult> {
  if (
    expected !== undefined &&
    (journal.specId !== expected.specId || journal.inputFingerprint !== expected.fingerprint)
  ) {
    throw documentChangeError(
      'operation-conflict',
      'The operationId was already used with a different request.',
    );
  }

  if (journal.stage === 'failed') {
    const reason = journal.reason ?? '';
    const cause = (DOCUMENT_CHANGE_CAUSES as readonly string[]).includes(reason)
      ? (reason as (typeof DOCUMENT_CHANGE_CAUSES)[number])
      : 'operation-state-invalid';

    throw documentChangeError(cause, 'The operation was refused; nothing was written.');
  }

  const plan = await loadPlan(rt, journal);

  const writing =
    journal.stage === 'reserved' ||
    journal.stage === 'files-writing' ||
    (journal.stage === 'recovery-required' && journal.recoveryPhase === 'write');
  if (writing) {
    await assertWriterGone(rt, journal);
    try {
      return await proceed(rt, await claimWrite(rt, journal), plan, true);
    } catch (error) {
      // Another executor took the write first: what is stored now decides (a live writer is busy).
      if (error instanceof JournalMovedError) {
        return replayJournal(rt, error.current, expected);
      }

      throw error;
    }
  }

  if (journal.stage === 'queued') {
    // Acknowledged. What may still be owed after a stop: the release of the content payload, and without
    // Git the completion.
    return proceed(rt, journal, plan, true);
  }

  if (journal.stage === 'completed') {
    // A completed record still in the active directory (the stop came before it moved): move it.
    await settleDocumentChangeJournal(rt.context, journal.operationId).catch(skipUnlessCut);
  }

  return resultOf(journal, plan, commitInfoOfJournal(journal, rt.now().getTime()), true);
}

/**
 * A journal in `reserved` / `files-writing` names the executor that was writing it. It is continued only
 * when that executor is provably gone (the dead proof) or this process left it (a failure inside this
 * process), or an operator asserted it. A live or unknown one is `SPEC_BUSY`: two writers are never run
 * knowingly. (Two replays that both pass this converge anyway: every path step is idempotent.)
 */
async function assertWriterGone(rt: WriteRuntime, journal: DocumentChangeJournal): Promise<void> {
  if (journal.executor === undefined) {
    return;
  }

  const state = await proveExecutorState(
    journal.executor,
    await rt.executor(),
    rt.options.processTable ?? nodeProcessTable,
  );
  if (state === 'dead' || state === 'self' || rt.options.confirmWriterStopped === true) {
    return;
  }

  throw documentChangeError(
    'busy-write-in-progress',
    'The document operation is being written by another process.',
    { retryAfterMs: BUSY_RETRY_AFTER_MS },
  );
}
