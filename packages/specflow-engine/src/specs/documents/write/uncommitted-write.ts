import { openVersionControl } from '../../../version-control';
import {
  LedgerLimitError,
  readLedgerRecord,
  recordLedgerEntries,
  withLedgerLock,
} from '../../durable';
import { documentChangeError } from '../changes/errors';
import type { DocumentChangeJournal } from '../changes/journal/model';
import type { DocumentChangePlan } from '../changes/plan/model';
import { transitionDocumentChangeJournal } from './journal-store';
import { readPreflightSignature } from './preflight-cache';
import type { WriteRuntime } from './writer-types';

/** Why a manual-mode write ends uncommitted: auto-commit is off for the documents. */
export const UNCOMMITTED_AUTO_COMMIT_OFF = 'auto-commit-off';

/** The branch and HEAD a new ledger record pins; read outside the lock, ignored by a record that has entries. */
async function ledgerPin(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
): Promise<{ readonly branch: string | null; readonly head: string | null }> {
  const owner = { kind: 'specification', id: journal.specId } as const;
  const existing = await readLedgerRecord(rt.context, journal.workspaceId, owner).catch(
    () => undefined,
  );
  if (existing !== undefined && existing.entries.length > 0) {
    return { branch: existing.branch, head: existing.head };
  }
  const signature = await (rt.options.git?.signature ?? readPreflightSignature)(
    rt.context,
    journal.workspaceRoot,
  );
  let head: string | null = null;
  try {
    const commits = rt.options.commits ?? openVersionControl(rt.engine).commits;
    head = (await commits.head(journal.workspaceRoot)) ?? null;
  } catch {
    // An unborn branch or an unreadable repository pins no head; the entry is still recorded.
  }
  return { branch: signature.branchRef ?? null, head };
}

/**
 * The completion of a write made with auto-commit off (ADR 0018 decision 4): the files and the
 * manifest are durable, so the ledger entries are upserted and, in the SAME control-lock section,
 * the journal moves from `files-writing` to `completed` (`uncommitted`, reason `auto-commit-off`).
 * The upsert comes first and is idempotent by operation id, so a stop between the two effects is
 * finished by the roll-forward of the same operation: the ledger never lacks a path the journal
 * reports as written. No queue, no preflight, no Git mutation.
 */
export async function completeUncommittedWrite(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
): Promise<DocumentChangeJournal> {
  const pin = await ledgerPin(rt, journal);
  await rt.hooks.beforeJournalWrite?.('completed');
  const now = rt.nowIso();
  const completed = await transitionDocumentChangeJournal(
    rt.context,
    journal.operationId,
    ['files-writing'],
    'completed',
    { outcome: 'uncommitted', reason: UNCOMMITTED_AUTO_COMMIT_OFF },
    now,
    undefined,
    async () => {
      try {
        await recordLedgerEntries(
          rt.context,
          {
            projectId: rt.context.project.projectId,
            workspaceId: journal.workspaceId,
            workspaceRoot: journal.workspaceRoot,
            owner: { kind: 'specification', id: journal.specId },
          },
          {
            operationId: journal.operationId,
            reason: UNCOMMITTED_AUTO_COMMIT_OFF,
            recordedAt: now,
            branch: pin.branch,
            head: pin.head,
            paths: plan.paths.map((path) => ({
              path: path.path,
              postSha256: path.post?.sha256 ?? null,
            })),
          },
        );
      } catch (error) {
        if (error instanceof LedgerLimitError) {
          throw documentChangeError(
            'uncommitted-limit',
            'Too many uncommitted paths; commit the pending changes first.',
          );
        }
        throw error;
      }
      await rt.hooks.afterLedgerWrite?.();
    },
  );
  await rt.hooks.afterJournalWrite?.('completed');
  return completed;
}

/**
 * A write made while Git is disabled leaves the files in a state the ledger must not contradict: an
 * entry the path already has (from a write made while Git was on) is re-imaged to the new post-image, so
 * enabling Git again does not turn the Engine's own content into a "foreign edit". A path with no entry
 * gets none (nothing can be committed while Git is off, so there is nothing to track). Idempotent by
 * operation id, so a roll-forward after a stop adds nothing twice.
 */
export async function reimageUncommittedPaths(
  rt: WriteRuntime,
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
): Promise<void> {
  const owner = { kind: 'specification', id: journal.specId } as const;
  // An unreadable record is not this write's to judge: the files are written, the commit side fails closed.
  const record = await readLedgerRecord(rt.context, journal.workspaceId, owner).catch(
    () => undefined,
  );
  if (record === undefined) return;
  const known = new Set(record.entries.map((entry) => entry.path));
  const paths = plan.paths
    .filter((path) => known.has(path.path))
    .map((path) => ({ path: path.path, postSha256: path.post?.sha256 ?? null }));
  if (paths.length === 0) return;
  await withLedgerLock(rt.context, () =>
    recordLedgerEntries(
      rt.context,
      {
        projectId: rt.context.project.projectId,
        workspaceId: journal.workspaceId,
        workspaceRoot: journal.workspaceRoot,
        owner,
      },
      {
        operationId: journal.operationId,
        reason: UNCOMMITTED_AUTO_COMMIT_OFF,
        recordedAt: rt.nowIso(),
        branch: record.branch,
        head: record.head,
        paths,
      },
    ),
  );
}
