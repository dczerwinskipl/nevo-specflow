import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../../application';
import { sha256Hex } from '../../../hash';
import { holdsProjectControlLock } from '../../../project/control-lock';
import { openVersionControl } from '../../../version-control';
import type { CommitPort } from '../../../version-control/commits/port';
import { resolveSpecification } from '../../discovery';
import {
  LEDGER_BRANCH_MAX_CHARACTERS,
  LEDGER_MAX_PATHS,
  LedgerCorruptError,
  LedgerLimitError,
  SharedResourceError,
  ensureJournalDirectory,
  moveJournalToSettled,
  publishJournal,
  readLedgerRecord,
  recordLedgerEntries,
  writePayload,
} from '../../durable';
import { isExecutionStatePath } from '../../execution-paths';
import { resourcesForDocumentChange } from '../changes/claims';
import { documentChangeError } from '../changes/errors';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { DOCUMENT_BATCH_MAX_PATHS } from '../changes/limits';
import { encodePlan } from '../changes/plan/codec';
import { containerDirectory } from '../changes/plan/container';
import {
  DOCUMENT_CHANGE_PLAN_VERSION,
  type DocumentChangePlan,
  type FileState,
} from '../changes/plan/model';
import { queueCapacityOf } from '../changes/queue-capacity';
import { admitGitCommit, type GitAdmission, type GitPreflightOptions } from './git-preflight';
import { listDocumentChangeJournals } from './journal-store';
import { assertNoClaimedBatchOverlap } from './reservation-guard';
import { UNCOMMITTED_AUTO_COMMIT_OFF } from './uncommitted-write';
import type { BatchViewProvider, DocumentWriteDependencies } from './writer-types';

/**
 * Commits of the Specification execution store's writes (`.execution/**`, `tasks/**`), owner decision
 * of 2026-11-12: a workflow change made by the owner, the UI or the CLI is committed like a change of
 * the Specification's documents. It is ONE document operation of action `workflow` in the document
 * journal store, with the same commit policy (`git.commits.auto.documents`, pinned at admission),
 * claims, queue, batches, trailers, ledger and recovery as a document change; only its files were
 * written by the execution store, not by the document writer (`source: written`).
 *
 * The store calls {@link admitExecutionStateCommit} under the project control lock with the paths it
 * is about to write (before its own journal exists: a change the policy refuses writes nothing, as for
 * a document), then `record` in the same lock section with what it wrote:
 *
 * - auto-commit on: the journal is published `queued` (its `checkout-scoped` claim held; the
 *   composition `documents/api.ts` wakes the scheduler); the queue commits it with the next batch,
 *   `pre`/`post` checked like any member;
 * - auto-commit off: the ledger entries are upserted and the journal ends `completed` (`uncommitted`,
 *   `auto-commit-off`), as a manual-mode document write does;
 * - Git disabled: nothing is recorded.
 *
 * Ordering with the Task documents (D03): a Task document change refuses while the store has a pending
 * change of the Task, and the store refuses (`WORKFLOW_TASK_BUSY`) while a Task document change is not
 * final, so neither ever writes a file the other has not recorded. A queued `workflow` operation is
 * not such a pending change (its plan names no Task): a later document change of the same `task.yaml`
 * plans from the file the store wrote and queues after it, the batch keeping the first `pre` and the
 * last `post`. What can still meet is a claimed batch: the admission refuses a path a batch being
 * committed holds (`SPEC_BUSY`, `commit-in-progress`), exactly like a document reservation. No barrier
 * check is needed: no document writer writes execution state outside those D03 exclusions, and a
 * `workflow` operation is never in a writing stage.
 *
 * A stop between the store's files and `record` leaves them dirty and outside the ledger; a
 * Specification Close takes them into its archive commit (`specs/lifecycle`).
 */

/** One path the store wrote, relative to the Specification directory, with its content before and after. */
export interface ExecutionStateWrite {
  readonly path: string;
  readonly pre: FileState;
  readonly post: FileState;
}

/** A change the commit policy admitted; `record` must run in the same control-lock section. */
export interface AdmittedExecutionStateCommit {
  /**
   * Records the paths written: `queued` for the queue (the caller wakes the scheduler), `uncommitted`
   * in the ledger, `nothing` when `writes` is empty or Git is disabled.
   */
  record(summary: string, writes: readonly ExecutionStateWrite[]): Promise<ExecutionStateRecord>;
}

export type ExecutionStateRecord = 'queued' | 'uncommitted' | 'nothing';

export interface ExecutionStateCommitDependencies {
  readonly assertClaims: DocumentWriteDependencies['assertClaims'];
  /** The batches and manual commits that hold paths (the queue's batch store). */
  readonly batches: BatchViewProvider;
}

export interface ExecutionStateCommitOptions {
  readonly commits?: CommitPort;
  readonly git?: GitPreflightOptions;
  readonly now?: () => Date;
}

const NOTHING_TO_RECORD: AdmittedExecutionStateCommit = {
  record: () => Promise.resolve('nothing'),
};

/**
 * Admits a change of the Specification execution store whose writes will touch `paths` (relative to
 * the Specification directory). Caller MUST hold the project control lock. Refusals are the document
 * vocabulary: the Git policy and preflight (`admitGitCommit`), a Create or Close holding the checkout,
 * a full queue, a batch being committed that holds a path (`SPEC_BUSY`) and the bounds of a batch or
 * of the ledger.
 */
export async function admitExecutionStateCommit(
  engine: SpecFlowEngine,
  deps: ExecutionStateCommitDependencies,
  specId: string,
  paths: readonly string[],
  options: ExecutionStateCommitOptions = {},
): Promise<AdmittedExecutionStateCommit> {
  const context = engine.context;
  if (!holdsProjectControlLock(context)) {
    throw new Error('The execution-state commit is admitted under the project control lock.');
  }

  if (paths.some((path) => !isExecutionStatePath(path))) {
    throw new Error('Only execution state of the Specification is committed this way.');
  }

  const found = await resolveSpecification(engine, specId);
  if (found.status !== 'available' || found.specification.location !== 'active') {
    throw documentChangeError('source-unavailable', 'The Specification source is unavailable.');
  }

  const { workspaceId, workspaceRoot } = found;
  const slug = found.specification.slug;
  const directory = containerDirectory(slug, { kind: 'specification' });
  const checkoutPaths = paths.map((path) => directory + '/' + path);
  const commits = options.commits ?? openVersionControl(engine).commits;
  const git = await admitGitCommit(engine, commits, workspaceRoot, checkoutPaths, options.git);
  if (!git.enabled) {
    return NOTHING_TO_RECORD;
  }

  const operationId = randomUUID();
  try {
    await deps.assertClaims(context, resourcesForDocumentChange({ workspaceId }), {
      kind: 'document-change',
      operationId,
    });
  } catch (error) {
    if (error instanceof SharedResourceError) {
      if (error.code === 'RESOURCE_JOURNAL_CORRUPT') {
        throw documentChangeError('journal-corrupt', 'A journal is corrupt; recover it.');
      }

      throw documentChangeError('busy-create-or-close', 'A Create or Close holds this checkout.');
    }

    throw error;
  }

  const journals = (await listDocumentChangeJournals(context)).filter(
    (journal) => journal.workspaceId === workspaceId,
  );
  const capacity = queueCapacityOf(journals);
  if (capacity === 'queue-full') {
    throw documentChangeError(
      'busy-queue-full',
      'Too many document changes are waiting; retry shortly.',
    );
  }

  if (capacity === 'held-limit') {
    throw documentChangeError(
      'busy-held-limit',
      'Too many document changes wait for a decision; retry, abandon or recover them.',
    );
  }

  assertNoClaimedBatchOverlap(
    workspaceId,
    checkoutPaths,
    await deps.batches.list(context, workspaceId),
  );
  await assertWithinBounds(engine, git, { workspaceId, specId }, checkoutPaths);

  const target: RecordTarget = {
    engine,
    git,
    operationId,
    specId,
    slug,
    directory,
    workspaceId,
    workspaceRoot,
    commits,
    now: options.now ?? (() => new Date()),
  };

  return { record: (summary, writes) => recordWrites(target, summary, writes) };
}

async function assertWithinBounds(
  engine: SpecFlowEngine,
  git: Exclude<GitAdmission, { enabled: false }>,
  subject: { readonly workspaceId: string; readonly specId: string },
  paths: readonly string[],
): Promise<void> {
  if (paths.length > DOCUMENT_BATCH_MAX_PATHS) {
    throw documentChangeError(
      'limit-exceeded',
      'The change writes too many paths to commit at once.',
    );
  }

  if (git.mode !== 'manual') {
    return;
  }

  if ((git.branch?.length ?? 0) > LEDGER_BRANCH_MAX_CHARACTERS) {
    throw documentChangeError(
      'commit-blocked',
      'The branch name is too long to record uncommitted changes on it.',
      { blockedBy: 'branch-name-too-long' },
    );
  }

  let record;
  try {
    record = await readLedgerRecord(engine.context, subject.workspaceId, {
      kind: 'specification',
      id: subject.specId,
    });
  } catch (error) {
    if (error instanceof LedgerCorruptError) {
      throw documentChangeError('journal-corrupt', 'The uncommitted-changes ledger is corrupt.');
    }

    throw error;
  }

  const known = new Set([...(record?.entries ?? []).map((entry) => entry.path), ...paths]);
  if (known.size > LEDGER_MAX_PATHS) {
    throw documentChangeError(
      'uncommitted-limit',
      'Too many uncommitted paths; commit the pending changes first.',
    );
  }
}

interface RecordTarget {
  readonly engine: SpecFlowEngine;
  readonly git: Exclude<GitAdmission, { enabled: false }>;
  readonly operationId: string;
  readonly specId: string;
  readonly slug: string;
  readonly directory: string;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly commits: CommitPort;
  readonly now: () => Date;
}

async function recordWrites(
  target: RecordTarget,
  summary: string,
  writes: readonly ExecutionStateWrite[],
): Promise<ExecutionStateRecord> {
  if (writes.length === 0) {
    return 'nothing';
  }

  const context = target.engine.context;
  const plan: DocumentChangePlan = {
    version: DOCUMENT_CHANGE_PLAN_VERSION,
    action: 'workflow',
    specId: target.specId,
    slug: target.slug,
    directory: target.directory,
    paths: writes.map((write) => ({
      path: target.directory + '/' + write.path,
      role: 'document' as const,
      pre: write.pre,
      post: write.post,
      source: write.post === null ? { kind: 'none' as const } : { kind: 'written' as const },
    })),
    documents: [],
    removedDocumentIds: [],
    folders: [],
    allocatedIds: [],
    templates: [],
    summary,
  };
  const encoded = encodePlan(plan);
  await ensureJournalDirectory(context, DOCUMENT_CHANGE_JOURNAL_KIND);
  const journals = await listDocumentChangeJournals(context);
  const sequence =
    journals
      .filter((journal) => journal.workspaceId === target.workspaceId)
      .reduce((highest, journal) => Math.max(highest, journal.sequence), 0) + 1;
  await writePayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, target.operationId, [
    { sha256: encoded.sha256, content: encoded.text },
  ]);
  const now = target.now().toISOString();
  const base = {
    version: 1 as const,
    projectId: context.project.projectId,
    operationId: target.operationId,
    specId: target.specId,
    slug: target.slug,
    workspaceId: target.workspaceId,
    workspaceRoot: target.workspaceRoot,
    action: 'workflow' as const,
    // No client request: the plan is what identifies the change.
    inputFingerprint: sha256Hex(encoded.text),
    sequence,
    createdAt: now,
    updatedAt: now,
    plan: {
      sha256: encoded.sha256,
      bytes: encoded.bytes,
      pathCount: plan.paths.length,
      documentCount: 0,
    },
    attempts: 0,
  };

  if (target.git.mode === 'auto') {
    const queued: DocumentChangeJournal = {
      ...base,
      stage: 'queued',
      commit: { branch: target.git.branch },
      commitMode: 'auto',
      queuedAt: now,
    };
    await publishJournal(context, DOCUMENT_CHANGE_JOURNAL_KIND, queued);

    return 'queued';
  }

  // Auto-commit off: the ledger first, then the settled journal (the order of a manual-mode write).
  try {
    await recordLedgerEntries(
      context,
      {
        projectId: context.project.projectId,
        workspaceId: target.workspaceId,
        workspaceRoot: target.workspaceRoot,
        owner: { kind: 'specification', id: target.specId },
      },
      {
        operationId: target.operationId,
        reason: UNCOMMITTED_AUTO_COMMIT_OFF,
        recordedAt: now,
        ...(await ledgerPin(target)),
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

  const completed: DocumentChangeJournal = {
    ...base,
    stage: 'completed',
    commitMode: 'manual',
    outcome: 'uncommitted',
    reason: UNCOMMITTED_AUTO_COMMIT_OFF,
    settledAt: now,
  };
  await publishJournal(context, DOCUMENT_CHANGE_JOURNAL_KIND, completed);
  await moveJournalToSettled(context, DOCUMENT_CHANGE_JOURNAL_KIND, target.operationId);

  return 'uncommitted';
}

/** The branch and HEAD a new ledger record pins (a record with entries keeps its own). */
async function ledgerPin(
  target: RecordTarget,
): Promise<{ readonly branch: string | null; readonly head: string | null }> {
  const existing = await readLedgerRecord(target.engine.context, target.workspaceId, {
    kind: 'specification',
    id: target.specId,
  }).catch(() => undefined);
  if (existing !== undefined && existing.entries.length > 0) {
    return { branch: existing.branch, head: existing.head };
  }

  let head: string | null = null;
  try {
    head = (await target.commits.head(target.workspaceRoot)) ?? null;
  } catch {
    // An unborn branch or an unreadable repository pins no head; the entries are still recorded.
  }

  return { branch: target.git.mode === 'manual' ? target.git.branch : null, head };
}
