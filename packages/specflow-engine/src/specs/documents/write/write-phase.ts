import { isDeepStrictEqual } from 'node:util';
import { dirname, join, relative, sep } from 'node:path';

import type { DocumentErrorDetails } from '@nevo/specflow-contracts/documents';

import { CONTENT_HASH_MAX_BYTES } from '../limits';
import { errnoCode } from '../../document-rules/errno';
import { DocumentError } from '../../document-rules/errors';
import { aliasedPhysicalPath } from '../../document-rules/verified-file';
import { readPayload, removePayload, removePayloadFilesExcept } from '../../durable';
import {
  CASE_ONLY_RENAME_MESSAGE,
  documentChangeError,
  type DocumentChangeCause,
  type DocumentChangeErrorExtras,
} from '../changes/errors';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import type { DocumentChangeJournal } from '../changes/journal/model';
import type { DocumentChangeStage } from '../changes/journal/stages';
import type { DocumentChangeTransitionPatch } from '../changes/journal/transition';
import type { DocumentChangePlan, PlannedPath } from '../changes/plan/model';
import {
  BACKUP_INDEX_START,
  BACKUP_PREFIX,
  FOREIGN_BACKUP_PREFIX,
  WriterInterrupted,
  applyPlannedPath,
  dispositionOf,
  isStageFileOf,
  observePath,
  readFileBytes,
  relativeToDirectory,
  removeStageFiles,
  sameFileState,
  type PathDisposition,
} from './file-effects';
import {
  JournalMovedError,
  settleDocumentChangeJournal,
  transitionDocumentChangeJournal,
} from './journal-store';
import { planRemovesAnAliasedEntry } from './physical-aliases';
import { completeUncommittedWrite, reimageUncommittedPaths } from './uncommitted-write';
import type { WriteRuntime } from './writer-types';

/** Moves the stored journal with the hooks around the (locked) write. Hooks run outside the lock. */
export async function moveJournal(
  rt: WriteRuntime,
  operationId: string,
  from: readonly DocumentChangeStage[],
  to: DocumentChangeStage,
  patch: DocumentChangeTransitionPatch = {},
  guard?: (current: DocumentChangeJournal) => boolean,
): Promise<DocumentChangeJournal> {
  await rt.hooks.beforeJournalWrite?.(to);
  const next = await transitionDocumentChangeJournal(
    rt.context,
    operationId,
    from,
    to,
    patch,
    rt.nowIso(),
    guard,
  );
  await rt.hooks.afterJournalWrite?.(to);
  return next;
}

/** A Node errno code (`ENOSPC`, `EIO`, ...), as opposed to the codes of the Engine's own errors. */
export function isErrno(error: unknown): boolean {
  return /^E[A-Z0-9]+$/u.test(errnoCode(error) ?? '');
}

/** The cause of a failure of the write phase; `write-ambiguous` when nothing says more. */
export function writeCauseOf(error: unknown): DocumentChangeCause {
  const code = errnoCode(error);
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'write-no-space';
  if (error instanceof DocumentError) {
    if (error.code === 'SPEC_SOURCE_UNAVAILABLE') return 'write-io-error';
    if (error.details?.cause === 'payload-unprovable') return 'payload-unprovable';
    return 'write-ambiguous';
  }
  return isErrno(error) ? 'write-io-error' : 'write-ambiguous';
}

const RETRYABLE: readonly DocumentChangeCause[] = ['write-no-space', 'write-io-error'];

/** Runs a file effect, repeating it after an I/O failure a bounded number of times. */
async function withRetries<T>(rt: WriteRuntime, action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof WriterInterrupted ||
        attempt >= rt.retries.count ||
        !RETRYABLE.includes(writeCauseOf(error))
      ) {
        throw error;
      }
      await rt.sleep(rt.retries.delayMs);
    }
  }
}

function specDirOf(journal: DocumentChangeJournal, plan: DocumentChangePlan): string {
  return join(journal.workspaceRoot, ...plan.directory.split('/'));
}

/** The bytes a path of the plan is written with: the payload, or the origin of a move. */
async function contentOf(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
  planned: PlannedPath,
): Promise<Uint8Array> {
  if (planned.post === null) return new Uint8Array();
  if (planned.source.kind === 'payload') {
    const text = await readPayload(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, journal.operationId, {
      sha256: planned.post.sha256,
      bytes: planned.post.bytes,
    });
    return Buffer.from(text, 'utf8');
  }
  if (planned.source.kind === 'moved-from') {
    const bytes = await readFileBytes(
      rt.files,
      specDirOf(journal, plan),
      relativeToDirectory(plan.directory, planned.source.path),
    );
    if (bytes === undefined) {
      throw documentChangeError('write-ambiguous', 'The origin of a moved document is gone.');
    }
    return bytes;
  }
  throw documentChangeError('plan-invalid', 'A written path has no content source.');
}

/** Where every path of the plan is, in plan order. */
export async function inspectPlanPaths(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
): Promise<readonly PathDisposition[]> {
  const specDir = specDirOf(journal, plan);
  const states: PathDisposition[] = [];
  for (const planned of plan.paths) {
    states.push(
      dispositionOf(
        await observePath(rt.files, specDir, relativeToDirectory(plan.directory, planned.path)),
        planned,
      ),
    );
  }
  return states;
}

/**
 * Flushes every directory the plan touched once more before the acknowledgement, so that a rename whose
 * own flush failed (and was then found already in place) is durable too.
 */
async function syncPlanDirectories(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
): Promise<void> {
  const specDir = specDirOf(journal, plan);
  const directories = new Set(
    plan.paths.map((planned) =>
      dirname(join(specDir, ...relativeToDirectory(plan.directory, planned.path).split('/'))),
    ),
  );
  for (const directory of directories) {
    await rt.files.syncDirectory(directory).catch((error: unknown) => {
      if (errnoCode(error) !== 'ENOENT') throw error;
    });
  }
}

/** The documents whose files are not as the plan expects, with their revision now (at most 25). */
async function conflictsOf(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
  dispositions: readonly PathDisposition[],
): Promise<DocumentErrorDetails['conflicts']> {
  const specDir = specDirOf(journal, plan);
  const conflicts: { documentId: string; revision: string }[] = [];
  for (const [index, planned] of plan.paths.entries()) {
    if (dispositions[index] !== 'foreign' || conflicts.length >= 25) continue;
    const relative = relativeToDirectory(plan.directory, planned.path);
    const document = plan.documents.find((candidate) => candidate.path === relative);
    if (document === undefined) continue;
    const now = await observePath(rt.files, specDir, relative).catch(() => null);
    if (now !== null && now !== 'not-regular' && now.bytes <= CONTENT_HASH_MAX_BYTES) {
      conflicts.push({ documentId: document.id, revision: now.sha256 });
    }
  }
  return conflicts.length > 0 ? conflicts : undefined;
}

/**
 * What a dead executor left as a backup link (`.nb...`): the old file of a replacement. It is
 * deleted only when it still holds the path's `pre`. Anything else is a foreign write that landed in
 * place between the link and the rename and lives only in that inode, so it is NOT thrown away: it
 * goes back over the target when the target still holds our `post` (the path is then foreign, like in
 * the live check), and otherwise is kept under a name that no stage cleanup matches (`.nf...`).
 */
async function settleBackupFile(
  rt: Pick<WriteRuntime, 'files'>,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
  directory: string,
  name: string,
): Promise<void> {
  const specDir = specDirOf(journal, plan);
  const index = Number.parseInt(name.slice(BACKUP_INDEX_START, BACKUP_INDEX_START + 2), 16);
  const planned = plan.paths[index];
  const backup = join(directory, name);
  const held = await observePath(rt.files, specDir, relative(specDir, backup).split(sep).join('/'));
  if (held === null || planned === undefined || sameFileState(held, planned.pre)) {
    await rt.files.remove(backup);
    return;
  }
  const targetRelative = relativeToDirectory(plan.directory, planned.path);
  const target = join(specDir, ...targetRelative.split('/'));
  if (sameFileState(await observePath(rt.files, specDir, targetRelative), planned.post)) {
    await rt.files.rename(backup, target);
    await rt.files.syncDirectory(dirname(target));
    return;
  }
  await rt.files.rename(backup, join(directory, FOREIGN_BACKUP_PREFIX + name.slice(3)));
}

/**
 * Removes the stage and backup files of the operation, whichever executor made them, from every
 * directory the plan touches. Safe only while the caller owns the operation (it is the writer, or the
 * operation ended); best effort, a failure is not an error of the write.
 */
export async function cleanStageFiles(
  rt: Pick<WriteRuntime, 'files'>,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
): Promise<void> {
  const specDir = specDirOf(journal, plan);
  const directories = new Set(
    plan.paths.map((planned) =>
      dirname(join(specDir, ...relativeToDirectory(plan.directory, planned.path).split('/'))),
    ),
  );
  for (const directory of directories) {
    for (const name of await rt.files.list(directory).catch(() => [])) {
      if (!name.startsWith(BACKUP_PREFIX) || !isStageFileOf(journal.operationId, name)) continue;
      await settleBackupFile(rt, journal, plan, directory, name).catch(skipUnlessCut);
    }
    await removeStageFiles(rt.files, directory, journal.operationId).catch(skipUnlessCut);
  }
}

/**
 * A refusal while NOTHING of the operation is on disk (a foreign edit found at the reservation, or
 * right after `files-writing` was written): the journal becomes `failed` (no claim, no barrier), moves
 * to `settled/` and the payload goes. Throws `DOCUMENT_REVISION_CONFLICT`, or the given refusal (its
 * cause is the recorded reason, so a replay answers the same).
 */
export async function refuseWithoutChanges(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
  dispositions: readonly PathDisposition[],
  refusal?: { readonly cause: DocumentChangeCause; readonly message: string },
): Promise<never> {
  const conflicts = await conflictsOf(rt, journal, plan, dispositions);
  await moveJournal(rt, journal.operationId, [journal.stage], 'failed', {
    reason: refusal?.cause ?? 'revision-conflict',
  });
  await cleanStageFiles(rt, journal, plan);
  await settleDocumentChangeJournal(rt.context, journal.operationId).catch(skipUnlessCut);
  await removePayload(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, journal.operationId).catch(
    skipUnlessCut,
  );
  if (refusal !== undefined) throw documentChangeError(refusal.cause, refusal.message);
  throw documentChangeError(
    'revision-conflict',
    'A document changed since it was read; nothing was written.',
    conflicts !== undefined ? { conflicts } : {},
  );
}

/** Best effort that never swallows the cut of a simulated crash. */
export function skipUnlessCut(error: unknown): void {
  if (error instanceof WriterInterrupted || error instanceof JournalMovedError) throw error;
}

/**
 * The write phase can no longer proceed on its own: the operation becomes `recovery-required`
 * (`write`), holding the claim and the barrier, and the failure is reported. A client retries the
 * same `operationId`, which rolls forward again. A failure to record it leaves the journal in
 * `files-writing`, which is the same state for the claim, and still reports the failure.
 */
async function stopWriting(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
  cause: DocumentChangeCause,
  reason: string,
  message: string,
  extras: DocumentChangeErrorExtras = {},
): Promise<Error> {
  await cleanStageFiles(rt, journal, plan);
  if (journal.stage === 'files-writing') {
    try {
      await moveJournal(rt, journal.operationId, ['files-writing'], 'recovery-required', {
        recoveryPhase: 'write',
        reason,
      });
    } catch (error) {
      if (error instanceof WriterInterrupted || error instanceof JournalMovedError) throw error;
    }
  }
  return documentChangeError(cause, message, extras);
}

/**
 * Takes over the write of an operation that is `files-writing` or `recovery-required` (its write
 * phase), as ONE compare-and-replace under the control lock: the journal must still show the executor
 * that was proven gone (or, from recovery, no executor), and afterwards it names this one. A second
 * replayer that proved the same executor dead finds the record changed and does not write.
 */
export async function claimWrite(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
): Promise<DocumentChangeJournal> {
  if (journal.stage === 'reserved') return journal;
  return moveJournal(
    rt,
    journal.operationId,
    [journal.stage],
    'files-writing',
    { executor: await rt.executor() },
    (current) =>
      current.stage === 'recovery-required'
        ? current.recoveryPhase === 'write'
        : isDeepStrictEqual(current.executor, journal.executor),
  );
}

/**
 * Brings every path of the plan to its post state from the payload, in plan order (writes, removals,
 * the manifest last), while the operation holds its claim and barrier; then verifies the post state and
 * moves the journal to `queued`. Used by the first write, by a retry of the same operation and by
 * crash recovery alike: a path already in place is skipped, so rolling forward twice is harmless. The
 * caller owns the write: the journal is `reserved`, or was taken with {@link claimWrite}.
 *
 * A path that is neither at its pre nor at its post state is `foreign`. While nothing of the operation
 * is in place that is a refusal (`failed`, no claim, `DOCUMENT_REVISION_CONFLICT`); once anything is
 * in place it is `recovery-required` (`write`) and `DOCUMENT_RECOVERY_REQUIRED`. An I/O failure is
 * retried a bounded number of times and then ends the same way (`DOCUMENT_WRITE_FAILED` for a full
 * disk or an I/O error). Rolling back is never done.
 */
export async function rollForward(
  rt: WriteRuntime,
  start: DocumentChangeJournal,
  plan: DocumentChangePlan,
): Promise<DocumentChangeJournal> {
  let journal = start;
  const specDir = specDirOf(journal, plan);
  // A plan that removes an entry it also writes here (a case-only rename on a volume that ignores
  // case, journaled before admission asked the file system) would write that file and then remove
  // it: it is never applied. Asked before any file of the operation is touched.
  const aliased =
    aliasedPhysicalPath(plan.paths.map((planned) => planned.path)) !== undefined ||
    (await planRemovesAnAliasedEntry(
      { lstat: (path) => rt.files.verified.lstat(path), list: (path) => rt.files.list(path) },
      specDir,
      plan,
    ));
  if (journal.stage === 'reserved') {
    if (aliased) {
      return refuseWithoutChanges(rt, journal, plan, [], {
        cause: 'case-only-rename',
        message: CASE_ONLY_RENAME_MESSAGE,
      });
    }
    const before = await inspectPlanPaths(rt, journal, plan);
    if (before.includes('foreign') && !before.includes('at-post')) {
      return refuseWithoutChanges(rt, journal, plan, before);
    }
    journal = await moveJournal(rt, journal.operationId, ['reserved'], 'files-writing', {
      executor: await rt.executor(),
    });
  }
  if (aliased) {
    throw await stopWriting(
      rt,
      journal,
      plan,
      'plan-invalid',
      'plan-invalid',
      'The operation names one file twice on this file system; nothing more is written.',
    );
  }
  // What an earlier executor of this operation left behind is not needed any more.
  await cleanStageFiles(rt, journal, plan);

  for (const [index, planned] of plan.paths.entries()) {
    let outcome;
    try {
      outcome = await withRetries(rt, () =>
        applyPlannedPath(
          {
            ops: rt.files,
            specDir,
            directory: plan.directory,
            operationId: journal.operationId,
            executorTag: rt.executorTag,
            index,
            ...(planned.source.kind === 'moved-from'
              ? { modeFrom: relativeToDirectory(plan.directory, planned.source.path) }
              : {}),
            observe: (event) => rt.hooks.onPathEffect?.(event) ?? Promise.resolve(),
          },
          planned,
          () => contentOf(rt, journal, plan, planned),
        ),
      );
    } catch (error) {
      if (error instanceof WriterInterrupted || error instanceof JournalMovedError) throw error;
      const cause = writeCauseOf(error);
      throw await stopWriting(rt, journal, plan, cause, cause, 'Writing the documents failed.');
    }
    if (outcome.kind === 'foreign') {
      const dispositions = await inspectPlanPaths(rt, journal, plan);
      if (!dispositions.includes('at-post')) {
        return refuseWithoutChanges(rt, journal, plan, dispositions);
      }
      throw await stopWriting(
        rt,
        journal,
        plan,
        'write-conflict',
        'content-changed',
        'A document changed while it was being written; the write needs recovery.',
        { conflicts: (await conflictsOf(rt, journal, plan, dispositions)) ?? [] },
      );
    }
  }

  try {
    await withRetries(rt, () => syncPlanDirectories(rt, journal, plan));
  } catch (error) {
    if (error instanceof WriterInterrupted || error instanceof JournalMovedError) throw error;
    const cause = writeCauseOf(error);
    throw await stopWriting(rt, journal, plan, cause, cause, 'Writing the documents failed.');
  }
  const after = await inspectPlanPaths(rt, journal, plan);
  if (after.some((state) => state !== 'at-post')) {
    throw await stopWriting(
      rt,
      journal,
      plan,
      'write-ambiguous',
      'write-ambiguous',
      'The documents are not in the expected state after the write.',
    );
  }
  // Auto-commit off: nothing is queued; the ledger records the paths and the operation completes.
  if (journal.commitMode === 'manual') return completeUncommittedWrite(rt, journal, plan);
  // Git disabled: nothing is queued or recorded, but an entry the path already has must follow the content.
  if (journal.commit === undefined) await reimageUncommittedPaths(rt, journal, plan);
  return moveJournal(rt, journal.operationId, ['files-writing'], 'queued');
}

/**
 * After the acknowledgement: the content payload is deleted (only the plan file stays, until the
 * operation settles) and, without Git, the operation completes on the spot as `not-applicable`. A
 * manual-mode operation arrives `completed` (uncommitted) and is only moved to `settled/`.
 * Failures here never undo the acknowledgement.
 */
export async function finishAcknowledged(
  rt: WriteRuntime,
  queued: DocumentChangeJournal,
): Promise<DocumentChangeJournal> {
  await removePayloadFilesExcept(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, queued.operationId, [
    queued.plan.sha256,
  ]).catch(skipUnlessCut);
  await rt.hooks.afterPayloadReleased?.();
  // Manual mode already completed uncommitted (with its ledger entries); only the move is left.
  if (queued.stage === 'completed') {
    await settleDocumentChangeJournal(rt.context, queued.operationId).catch(skipUnlessCut);
    return queued;
  }
  if (queued.commit !== undefined) return queued;
  const completed = await moveJournal(rt, queued.operationId, ['queued'], 'completed', {
    outcome: 'not-applicable',
    reason: 'git-disabled',
  });
  await settleDocumentChangeJournal(rt.context, queued.operationId).catch(skipUnlessCut);
  return completed;
}
