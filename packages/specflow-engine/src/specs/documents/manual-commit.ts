/**
 * The manual commit as the Runtime and the CLI call it (ADR 0018 decision 8): the composition that
 * resolves WHO a request covers (a Specification, the definitions of the Project Home, or every owner of
 * a checkout) and binds the manual commit module to the document queue it must not run beside. The
 * module itself (`specs/manual-commit`) imports neither the documents nor the Create slice; this file is
 * the one place that knows both. Authorization is the caller's: `allowDefinitions` is the CLI's alone.
 */
import type {
  CommitInfo,
  UncommittedEntry,
  UncommittedView,
} from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { assertSharedResourcesAvailable } from '../coordination/resources';
import { SpecificationError } from '../model';
import { openVersionControl } from '../../version-control';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';
import { resolveSpecificationForRead } from '../discovery';
import { DocumentError } from '../document-rules/errors';
import { foldPathKey } from '../document-rules/document-paths';
import {
  LedgerCorruptError,
  listLedgerRecords,
  readLedgerRecord,
  removeLedgerEntriesJudged,
} from '../durable';
import { ledgerOwnerOfKey, type LedgerOwner } from '../durable/ledger/model';
import {
  listManualCommitPathViews,
  commitUncommitted,
  createManualCommitRuntime,
  findManualCommitJournal,
  listManualCommitJournals,
  manualCommitError,
  readWorkingContents,
  recoverManualCommit,
  revisionOfScope,
  scopeEntriesOf,
  type ManualCommitDependencies,
  type ManualCommitDone,
  type ManualCommitOptions,
  type ManualCommitPorts,
  type ManualCommitRecoverMode,
  type ManualCommitScope,
  type ManualCommitTarget,
} from '../manual-commit';
import type { DocumentChangeJournal } from './changes/journal/model';
import { isBarrierStage, isPendingStage } from './changes/journal/stages';
import { documentChangeError } from './changes/errors';
import { documentBatchViews } from './queue/batch-store';
import type { BatchViewProvider } from './write/writer-types';
import { recoverDocumentOperation, type RecoverMode } from './queue/actions';
import { flushDocumentCommits } from './queue/flush';
import type { QueueDependencies } from './queue/types';
import { planOfJournal } from './queue/uncommitted';
import { readSpecificationUncommitted } from './uncommitted-reader';
import { findDocumentChangeJournal, listDocumentChangeJournals } from './write/journal-store';

export interface ManualCommitCommand {
  readonly operationId: string;
  readonly scope: ManualCommitScope;
  /** The Specification the request addresses: required for `specification`, optional for `all`. */
  readonly specId?: string;
  readonly message?: string;
  readonly paths?: readonly string[];
  readonly ledgerRevision?: string;
}

export interface ManualCommitCommandOptions extends ManualCommitOptions {
  /**
   * The `definitions` scope, and `all` including the definitions of the Project Home, are CLI-only
   * (ADR 0018 decision 8): a transport that is not the CLI leaves this off.
   */
  readonly allowDefinitions?: boolean;
  /**
   * Who the caller may commit for (ADR 0018 decision 8): the `all` scope takes only the ledger owners
   * that are Specifications this predicate accepts; the others keep their entries untouched. Absent: every
   * owner (the command line, which has no per-Specification authorization).
   */
  readonly canManageSpecification?: (specId: string) => boolean;
  readonly deps?: ManualCommitDependencies;
  /** Seams of the flush of the document queue (tests). */
  readonly queue?: QueueDependencies;
}

export interface ManualCommitCommandResult {
  readonly operationId: string;
  readonly commit: CommitInfo;
  /** The checkout paths the commit holds; empty when every path already equalled HEAD. */
  readonly paths: readonly string[];
  /** What the ledger of the scope still holds after the commit. */
  readonly remaining: { readonly entries: number; readonly ledgerRevision: string };
  /** The answer is the stored result of an operation that already ended. */
  readonly replayed: boolean;
}

/** Resolves the Specification of a request; an unknown or unavailable one is a document error. */
async function resolveSpecification(engine: SpecFlowEngine, specId: string) {
  let discovered;
  try {
    discovered = await resolveSpecificationForRead(engine, specId);
  } catch (error) {
    if (
      error instanceof SpecificationError &&
      (error.code === 'SPEC_NOT_FOUND' || error.code === 'SPEC_VALIDATION_ERROR')
    ) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', 'The Specification does not exist.');
    }

    throw error;
  }

  if (discovered.status !== 'available') {
    throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The Specification source is unavailable.');
  }

  return discovered;
}

/** Who the request covers (see the module comment). */
export async function resolveManualCommitTarget(
  engine: SpecFlowEngine,
  command: Pick<ManualCommitCommand, 'scope' | 'specId'>,
  allowDefinitions: boolean,
  canManageSpecification?: (specId: string) => boolean,
): Promise<ManualCommitTarget> {
  if (command.scope === 'definitions') {
    if (!allowDefinitions) {
      throw manualCommitError(
        'scope-not-allowed',
        'The definitions are committed from the command line only.',
      );
    }

    return {
      scope: 'definitions',
      checkout: {
        workspaceId: engine.workspace.workspaceId,
        root: engine.context.project.homeRoot,
      },
      owners: [{ kind: 'definitions' }],
    };
  }

  if (command.scope === 'specification' && command.specId === undefined) {
    throw manualCommitError('operation-invalid', 'A Specification is required for this scope.');
  }

  const specification =
    command.specId !== undefined ? await resolveSpecification(engine, command.specId) : undefined;
  if (specification?.specification.location === 'archive') {
    throw manualCommitError('archived', 'The Specification is archived.');
  }

  const checkout =
    specification !== undefined
      ? { workspaceId: specification.workspaceId, root: specification.workspaceRoot }
      : { workspaceId: engine.workspace.workspaceId, root: engine.workspace.root };
  const slug = specification?.specification.slug;
  if (command.scope === 'specification') {
    return {
      scope: 'specification',
      checkout,
      owners: [{ kind: 'specification', id: specification!.specId }],
      specId: specification!.specId,
      ...(slug !== undefined ? { slug } : {}),
    };
  }

  const listing = await listLedgerRecords(engine.context, { workspaceId: checkout.workspaceId });
  if (listing.unreadable > 0) {
    throw manualCommitError('journal-corrupt', 'The uncommitted-changes ledger is corrupt.');
  }

  const owners: LedgerOwner[] = listing.records
    .map((record) => record.owner)
    .filter((owner) => allowDefinitions || owner.kind !== 'definitions')
    .filter(
      (owner) =>
        owner.kind !== 'specification' ||
        canManageSpecification === undefined ||
        canManageSpecification(owner.id),
    );

  return {
    scope: 'all',
    checkout,
    owners,
    ...(specification !== undefined ? { specId: specification.specId } : {}),
    ...(slug !== undefined ? { slug } : {}),
  };
}

/** The specifications a scope serves in the queue: their journals count; `all` serves the whole checkout. */
function journalsOfScope<T extends { readonly specId: string; readonly workspaceId: string }>(
  journals: readonly T[],
  target: ManualCommitTarget,
): T[] {
  const specs = new Set(
    target.owners.flatMap((owner) => (owner.kind === 'specification' ? [owner.id] : [])),
  );

  return journals.filter(
    (journal) =>
      journal.workspaceId === target.checkout.workspaceId &&
      (target.scope === 'all' || specs.has(journal.specId)),
  );
}

/** The ports of the manual commit to the document queue and to the cross-slice claim check. */
export function manualCommitPorts(
  engine: SpecFlowEngine,
  options: ManualCommitCommandOptions = {},
): ManualCommitPorts {
  return {
    assertClaims: (requested, self) =>
      assertSharedResourcesAvailable(engine.context, requested, self),

    async settleQueue(target, waitMs) {
      const before = journalsOfScope(await listDocumentChangeJournals(engine.context), target);
      // A flush starts Git work: it runs only when something of the scope waits for the queue.
      if (before.some((journal) => isPendingStage(journal.stage))) {
        await flushDocumentCommits(engine, target.checkout, {
          waitCapMs: waitMs,
          ...(options.queue !== undefined ? { queue: options.queue } : {}),
        });
      }

      const after = journalsOfScope(await listDocumentChangeJournals(engine.context), target);

      return {
        pending: after.filter((journal) => isPendingStage(journal.stage)).length,
        failed: after.filter((journal) => journal.stage === 'commit-failed').length,
        recoveryRequired: after.filter((journal) => journal.stage === 'recovery-required').length,
      };
    },

    async assertQuiet(target, paths) {
      const wanted = new Set(paths.map(foldPathKey));
      for (const journal of await listDocumentChangeJournals(engine.context)) {
        if (journal.workspaceId !== target.checkout.workspaceId) {
          continue;
        }

        if (journal.stage === 'completed' || journal.stage === 'failed') {
          continue;
        }

        const plan = await planOfJournal(engine.context, journal);
        if (!plan.paths.some((path) => wanted.has(foldPathKey(path.path)))) {
          continue;
        }

        if (journal.stage === 'recovery-required' || journal.stage === 'commit-failed') {
          throw documentChangeError(
            'busy-recovery-required',
            'A document change of these paths waits for a decision.',
          );
        }

        throw documentChangeError(
          isBarrierStage(journal.stage, journal.recoveryPhase)
            ? 'busy-write-in-progress'
            : 'busy-commit-in-progress',
          'These documents are being written or committed; retry shortly.',
          { retryAfterMs: 1000 },
        );
      }

      const views = await documentBatchViews.list(engine.context, target.checkout.workspaceId);
      for (const view of views) {
        if (![...view.paths].some((path) => wanted.has(foldPathKey(path)))) {
          continue;
        }

        throw documentChangeError(
          view.state === 'recovery-required' ? 'busy-recovery-required' : 'busy-commit-in-progress',
          'These documents are being committed; retry shortly.',
          { retryAfterMs: 1000 },
        );
      }
    },
  };
}

/** What the ledger of the target still holds: the number of entries and the revision a client quotes. */
async function remainingOf(
  engine: SpecFlowEngine,
  target: ManualCommitTarget,
): Promise<{ entries: number; ledgerRevision: string }> {
  const records = [];
  for (const owner of target.owners) {
    try {
      const record = await readLedgerRecord(engine.context, target.checkout.workspaceId, owner);
      if (record !== undefined) {
        records.push(record);
      }
    } catch (error) {
      if (error instanceof LedgerCorruptError) {
        throw manualCommitError('journal-corrupt', 'The uncommitted-changes ledger is corrupt.');
      }

      throw error;
    }
  }

  const entries = scopeEntriesOf(records);

  return { entries: entries.length, ledgerRevision: revisionOfScope(entries) };
}

function commitInfoOf(done: ManualCommitDone): CommitInfo {
  const { journal } = done;
  if (journal.stage === 'failed' || journal.stage === 'recovery-required') {
    return {
      state: 'failed',
      ...(journal.reason !== undefined ? { reason: journal.reason } : {}),
      ...(journal.blockedBy !== undefined ? { blockedBy: journal.blockedBy } : {}),
      ...(journal.stage === 'recovery-required' ? { recoveryRequired: true } : {}),
    };
  }

  if (journal.outcome === 'committed' && journal.sha !== undefined) {
    return {
      state: 'committed',
      sha: journal.sha,
      ...(journal.settledAt !== undefined ? { settledAt: journal.settledAt } : {}),
    };
  }

  return {
    state: 'not-applicable',
    reason: journal.reason ?? 'nothing-to-commit',
    ...(journal.settledAt !== undefined ? { settledAt: journal.settledAt } : {}),
  };
}

async function resultOf(
  engine: SpecFlowEngine,
  target: ManualCommitTarget,
  done: ManualCommitDone,
): Promise<ManualCommitCommandResult> {
  return {
    operationId: done.journal.operationId,
    commit: commitInfoOf(done),
    paths: done.paths,
    remaining: await remainingOf(engine, target),
    replayed: done.replayed,
  };
}

/**
 * Commits the ledger paths of a scope with the person's message (ADR 0018 decision 8): synchronous,
 * through the same port, lease and claims as the document queue, idempotent by `operationId`. The
 * commit contains only ledger paths of the scope (and of `paths`) that differ from HEAD; it is never
 * `git commit -a`.
 */
export async function manualCommit(
  engine: SpecFlowEngine,
  command: ManualCommitCommand,
  options: ManualCommitCommandOptions = {},
): Promise<ManualCommitCommandResult> {
  const target = await resolveManualCommitTarget(
    engine,
    command,
    options.allowDefinitions === true,
    options.canManageSpecification,
  );
  const rt = createManualCommitRuntime(engine, options.deps, options);
  const done = await commitUncommitted(
    rt,
    target,
    {
      operationId: command.operationId,
      ...(command.message !== undefined ? { message: command.message } : {}),
      ...(command.paths !== undefined ? { paths: command.paths } : {}),
      ...(command.ledgerRevision !== undefined ? { ledgerRevision: command.ledgerRevision } : {}),
    },
    manualCommitPorts(engine, options),
  );

  return resultOf(engine, target, done);
}

/**
 * `recover <operation> --resume|--adopt|--abandon` for a manual commit (the operator's, CLI only).
 * `confirmExecutorStopped` is the operator's assertion that the process that held the lease has stopped.
 */
export async function recoverManualCommitOperation(
  engine: SpecFlowEngine,
  operationId: string,
  mode: ManualCommitRecoverMode,
  options: Pick<
    ManualCommitCommandOptions,
    'deps' | 'confirmExecutorStopped' | 'commitDeadlineMs'
  > = {},
): Promise<ManualCommitCommandResult> {
  const rt = createManualCommitRuntime(engine, options.deps, options);
  const done = await recoverManualCommit(rt, operationId, mode);
  const owners: LedgerOwner[] = done.journal.owners.flatMap((key) => {
    const owner = ledgerOwnerOfKey(key);

    return owner !== undefined ? [owner] : [];
  });
  const target: ManualCommitTarget = {
    scope: done.journal.scope,
    checkout: { workspaceId: done.journal.workspaceId, root: done.journal.workspaceRoot },
    owners,
  };

  return resultOf(engine, target, done);
}

/**
 * The paths the writer's reservation must not touch: those of the commit batches the queue holds and
 * those of the manual commits that have not ended (a manual commit is a `committing` batch for it).
 */
export const documentAndManualCommitViews: BatchViewProvider = {
  async list(context, workspaceId) {
    const batches = await documentBatchViews.list(context, workspaceId);
    const manual = await listManualCommitPathViews(context, workspaceId);

    return [
      ...batches,
      ...manual.map((view) => ({
        batchId: view.operationId,
        workspaceId: view.workspaceId,
        state:
          view.stage === 'recovery-required'
            ? ('recovery-required' as const)
            : ('committing' as const),
        paths: view.paths,
      })),
    ];
  },
};

/** One uncommitted path with the owner of the ledger record that holds it. */
export interface UncommittedScopeEntry extends UncommittedEntry {
  /** `definitions`, or the id of the Specification. */
  readonly owner: string;
}

/** What the ledger holds for a scope: the read behind `nevo-specflow commit status`. */
export interface UncommittedScopeView extends Omit<UncommittedView, 'entries'> {
  readonly scope: ManualCommitScope;
  readonly entries: readonly UncommittedScopeEntry[];
}

/**
 * The uncommitted changes of a scope, the policy and the queue work that would make a manual commit
 * unavailable. For a Specification it is the view of `GET /api/specs/:specId/uncommitted`; for the
 * definitions and a whole checkout it is the same shape built from their ledger records. Lock-free and Git-free.
 */
export async function readUncommittedScope(
  engine: SpecFlowEngine,
  command: Pick<ManualCommitCommand, 'scope' | 'specId'>,
  options: Pick<ManualCommitCommandOptions, 'allowDefinitions'> = {},
): Promise<UncommittedScopeView> {
  const target = await resolveManualCommitTarget(
    engine,
    command,
    options.allowDefinitions === true,
  );
  if (target.scope === 'specification' && target.specId !== undefined) {
    const view = await readSpecificationUncommitted(engine, target.specId);

    return {
      scope: 'specification',
      ...view,
      entries: view.entries.map((entry) => ({ ...entry, owner: target.specId! })),
    };
  }

  const records = [];
  for (const owner of target.owners) {
    const record = await readLedgerRecord(engine.context, target.checkout.workspaceId, owner).catch(
      (error: unknown) => {
        if (error instanceof LedgerCorruptError) {
          throw manualCommitError('journal-corrupt', 'The uncommitted-changes ledger is corrupt.');
        }

        throw error;
      },
    );
    if (record !== undefined) {
      records.push(record);
    }
  }

  const entries = scopeEntriesOf(records);
  const { policy } = await readProjectGitPolicy(engine.context).catch(() => ({
    policy: undefined,
  }));
  const effective = policy !== undefined ? effectiveAutoCommit(policy, 'documents') : undefined;
  const mine = journalsOfScope(await listDocumentChangeJournals(engine.context), target);

  return {
    scope: target.scope,
    ledgerRevision: revisionOfScope(entries),
    policy: {
      documents: effective?.auto === false ? 'manual' : 'auto',
      source: effective?.source ?? 'default',
    },
    entries: entries.map((entry) => ({
      path: entry.path,
      reason: entry.reason as UncommittedEntry['reason'],
      recordedAt: entry.recordedAt,
      operations: entry.operationCount,
      owner:
        entry.owner === 'definitions' ? 'definitions' : entry.owner.slice('specification-'.length),
    })),
    queue: {
      pending: mine.filter((journal) => isPendingStage(journal.stage)).length,
      failed: mine.filter((journal) => journal.stage === 'commit-failed').length,
      recoveryRequired: mine.filter((journal) => journal.stage === 'recovery-required').length,
    },
  };
}

/** What `recover` of an operation did, whichever kind of operation it was. */
export type RecoverOperationResult =
  | { readonly kind: 'document-change'; readonly journals: readonly DocumentChangeJournal[] }
  | { readonly kind: 'manual-commit'; readonly result: ManualCommitCommandResult };

/**
 * `recover <operation> --resume|--adopt|--abandon`: a manual commit is recovered by the manual
 * commit module, any other document operation by the document queue. One entry for the operator, who
 * has an operation id and does not need to know which kind it is.
 */
export async function recoverOperation(
  engine: SpecFlowEngine,
  operationId: string,
  mode: RecoverMode,
  options: {
    readonly confirmExecutorStopped?: boolean;
    readonly manual?: Pick<ManualCommitCommandOptions, 'deps' | 'commitDeadlineMs'>;
    readonly queue?: QueueDependencies;
  } = {},
): Promise<RecoverOperationResult> {
  if ((await findManualCommitJournal(engine.context, operationId)) !== undefined) {
    return {
      kind: 'manual-commit',
      result: await recoverManualCommitOperation(engine, operationId, mode, {
        ...options.manual,
        ...(options.confirmExecutorStopped === true ? { confirmExecutorStopped: true } : {}),
      }),
    };
  }

  return {
    kind: 'document-change',
    journals: await recoverDocumentOperation(
      engine,
      operationId,
      mode,
      options.queue ?? {},
      options.confirmExecutorStopped === true ? { confirmExecutorStopped: true } : {},
    ),
  };
}

export interface ResolveLedgerResult {
  /** Paths whose entries left the ledger: HEAD holds them, or a person has taken the content over. */
  readonly resolved: readonly string[];
  /** Paths that are still the Engine's uncommitted content: commit them. */
  readonly stillUncommitted: readonly string[];
}

/**
 * `specs documents resolve <operation>` (the operator's): drops the ledger entries of an operation that
 * the Engine can no longer commit or no longer needs to, because a person dealt with them by hand: the
 * path equals HEAD (a hand commit the next prune would also remove), or its content is no longer the
 * post-image the Engine left (someone edited it, so it is no longer the Engine's content). An entry whose
 * file still holds the Engine's post-image and differs from HEAD stays: forgetting it would hide
 * content the Engine wrote and did not commit (ADR 0018 invariant 13).
 */
export async function resolveLedgerOperation(
  engine: SpecFlowEngine,
  operationId: string,
  deps: Pick<ManualCommitDependencies, 'commits' | 'nowMs'> = {},
): Promise<ResolveLedgerResult> {
  const found =
    (await findManualCommitJournal(engine.context, operationId)) ??
    (await findDocumentChangeJournal(engine.context, operationId));
  if (found === undefined) {
    throw manualCommitError('operation-not-found', 'The operation does not exist.');
  }

  const records = (
    await listLedgerRecords(engine.context, { workspaceId: found.workspaceId })
  ).records.filter((record) =>
    record.entries.some((entry) => entry.operationIds.includes(operationId)),
  );
  const commits = deps.commits ?? openVersionControl(engine).commits;
  const now = deps.nowMs ?? (() => Date.now());
  const resolved: string[] = [];
  const stillUncommitted: string[] = [];
  for (const record of records) {
    const mine = record.entries.filter((entry) => entry.operationIds.includes(operationId));
    const paths = mine.map((entry) => entry.path);
    const split = await commits.effectivePaths(record.workspaceRoot, paths);
    const equalsHead = new Set(split.dropped);
    const working = await readWorkingContents(record.workspaceRoot, paths);
    const removable = mine.filter(
      (entry) => equalsHead.has(entry.path) || working.get(entry.path) !== entry.postSha256,
    );
    if (removable.length > 0) {
      await removeLedgerEntriesJudged(
        engine.context,
        record.workspaceId,
        record.owner,
        removable,
        () => new Date(now()).toISOString(),
      );
    }

    resolved.push(...removable.map((entry) => entry.path));
    stillUncommitted.push(
      ...mine.filter((entry) => !removable.includes(entry)).map((entry) => entry.path),
    );
  }

  return { resolved: resolved.sort(), stillUncommitted: stillUncommitted.sort() };
}

/** What the restart or takeover did with one manual commit that stopped holding its checkout. */
export interface ManualCommitResumeOutcome {
  readonly operationId: string;
  readonly outcome: 'resumed' | 'refused';
  readonly code?: string;
}

/**
 * Resumes the manual commits that hold a checkout without an executor (`reserved`, `committing`): what a
 * killed CLI leaves. Without the operator's assertion a live or unprovable executor is refused, exactly
 * like the queue's takeover; with it (`confirmExecutorStopped`) the commit is looked up by its trailer and
 * completed or made again. One that needs a decision (`recovery-required`) is the operator's `recover`.
 */
export async function resumeStoppedManualCommits(
  engine: SpecFlowEngine,
  options: {
    readonly workspaceId?: string;
    readonly confirmExecutorStopped?: boolean;
    readonly manual?: Pick<ManualCommitCommandOptions, 'deps' | 'commitDeadlineMs'>;
  } = {},
): Promise<ManualCommitResumeOutcome[]> {
  const outcomes: ManualCommitResumeOutcome[] = [];
  for (const journal of await listManualCommitJournals(engine.context)) {
    if (journal.stage !== 'reserved' && journal.stage !== 'committing') {
      continue;
    }

    if (options.workspaceId !== undefined && journal.workspaceId !== options.workspaceId) {
      continue;
    }

    try {
      await recoverManualCommitOperation(engine, journal.operationId, 'resume', {
        ...options.manual,
        ...(options.confirmExecutorStopped === true ? { confirmExecutorStopped: true } : {}),
      });
      outcomes.push({ operationId: journal.operationId, outcome: 'resumed' });
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      outcomes.push({
        operationId: journal.operationId,
        outcome: 'refused',
        ...(typeof code === 'string' ? { code } : {}),
      });
    }
  }

  return outcomes;
}
