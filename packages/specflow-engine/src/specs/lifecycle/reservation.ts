import { isDeepStrictEqual } from 'node:util';

import type { SpecFlowEngine } from '../../application';
import { withProjectControlLock } from '../../project/control-lock';
import {
  assertNoDocumentCommitsHold,
  assertNoUncommittedHold,
  flushAllCheckouts,
  flushCheckoutsForClose,
  type FlushOptions,
} from '../documents/queue/flush';
import { readWorkspaceRegistry } from '../../project/workspace/registry/registry';
import { runGitFreeMutation } from '../../project/request-verification-memo';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import {
  CloseOperationError,
  assertNoExternalMergeForSpecificationClose,
  assertSpecificationExit,
  type CloseJournal,
  type ClosePlan,
} from './model';
import { readCloseJournal, publishCloseJournal } from './journal/store';
import { assertResourcesAvailable } from './resources';
import {
  previewCloseOperation,
  siblingSpecificationDirectories,
  type CloseRequest,
} from './preflight';
import { repositoryModeOf } from './repository-mode';
import { resolveSpecification } from '../discovery';
import type { UncommittedAllowance } from '../uncommitted';

export async function inspectCloseOperation(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseJournal | undefined> {
  await engine.readRegistry();

  return readCloseJournal(engine.context, operationId);
}

/** Seams of the Close admission; production passes none. */
export interface ReserveCloseOptions {
  /** The flush of document commits (clock, pause, queue seams). */
  readonly flush?: FlushOptions;
  /** Observation point for tests; production passes none. */
  readonly hooks?: {
    /** The document commits were flushed and the control lock is not taken yet. */
    afterFlush?(): Promise<void>;
  };
}

/**
 * Durable admission ONLY. No archive, merge, registry rebind or worktree
 * disposal side effect exists in T10. Future use cases must own transitions.
 * Journal itself is the atomic resource reservation record, not an extra
 * registry file that could be torn by SIGKILL between two publications.
 */
export async function reserveCloseOperation(
  engine: SpecFlowEngine,
  request: CloseRequest & { readonly operationId: string },
  options: ReserveCloseOptions = {},
): Promise<{ readonly journal: CloseJournal; readonly existing: boolean }> {
  // Refused unconditionally, before even reading an existing journal (owner decision 2026-11-20):
  // a replay of an operationId with this combination gets the same explicit refusal as a fresh one.
  assertNoExternalMergeForSpecificationClose(request);

  // An existing reservation must remain observable even after Git/archive
  // mutations make the original first-admission preview impossible.
  const existing = await readCloseJournal(engine.context, request.operationId);
  if (existing) {
    assertMatchingRequest(existing, request);

    return { journal: existing, existing: true };
  }

  // Git inspection is outside the short coordination lock. The immutable
  // snapshot is verified against registry/config CAS inside the lock, and
  // future effects must re-verify pinned HEAD/index/physical source.
  const plan: ClosePlan = await previewWithDocumentFlush(engine, request, options);

  // With Git off the admission keeps the Git-free verification its preview ran with.
  return plan.gitOff
    ? runGitFreeMutation(() => admitClosePlan(engine, request, plan, options))
    : admitClosePlan(engine, request, plan, options);
}

/** The flush and the locked admission of a previewed plan (see {@link reserveCloseOperation}). */
async function admitClosePlan(
  engine: SpecFlowEngine,
  request: CloseRequest & { readonly operationId: string },
  plan: ClosePlan,
  options: ReserveCloseOptions,
): Promise<{ readonly journal: CloseJournal; readonly existing: boolean }> {
  // Document commits of every checkout the Close owns are flushed before the lock is taken (Git runs
  // here, never inside the lock); what is still pending, failed or abandoned refuses the Close.
  // The preview and the preflight stay pure: this is the only effect, and only at admission.
  const allowance = await allowanceOfPlan(engine, plan);
  await flushCheckoutsForClose(
    engine,
    [plan.source, ...(plan.target !== undefined ? [plan.target] : [])],
    options.flush,
    allowance,
  );
  await options.hooks?.afterFlush?.();

  return withProjectControlLock(engine.context, async () => {
    const previous = await readCloseJournal(engine.context, request.operationId);
    if (previous) {
      assertMatchingRequest(previous, request);

      return { journal: previous, existing: true };
    }

    const latest = await readWorkspaceRegistry(engine.context);
    if (latest.revision !== plan.registryRevision) {
      throw new CloseOperationError('CLOSE_CONFLICT', 'Registry revision changed after preview.');
    }

    // The repository mode the plan was decided with must still hold, for every plan (an
    // unreadable policy refuses with its error). With Git off the pinned revision is the policy that
    // turned Git off; with Git the configured default destination must be unchanged.
    const config = await readProjectGitPolicy(engine.context);
    if ((repositoryModeOf(config.policy) === 'git-off') !== (plan.gitOff === true)) {
      throw new CloseOperationError('CLOSE_CONFLICT', 'Project Git policy changed after preview.');
    }

    if (
      plan.configRevision !== undefined &&
      (config.revision !== plan.configRevision ||
        (!plan.gitOff && config.policy.integrationTargetBranch !== plan.targetBranch))
    ) {
      throw new CloseOperationError(
        'CLOSE_CONFLICT',
        'Project integration policy changed after preview.',
      );
    }

    // D07, judged again under the lock every workflow mutation takes: no Task or run changed
    // since the preview can slip past the exit gate.
    if (plan.kind === 'specification-close') {
      await assertSpecificationExit(engine.specificationExit, plan.specId);
    }

    // A manual-mode save writes no claim: one that landed after the flush above is judged here.
    await assertNoUncommittedHold(
      engine,
      [plan.source, ...(plan.target !== undefined ? [plan.target] : [])].map(
        (checkout) => checkout.workspaceId,
      ),
      allowance,
    );
    await assertResourcesAvailable(engine.context, plan.resources, {
      kind: 'close',
      operationId: plan.operationId,
    });
    const journal: CloseJournal = {
      version: 1,
      projectId: engine.context.project.projectId,
      gitInstanceId: engine.context.project.gitInstanceId,
      stage: 'reserved',
      plan,
    };
    await publishCloseJournal(engine.context, journal);
    const stored = await readCloseJournal(engine.context, plan.operationId);
    if (!stored || !isDeepStrictEqual(stored, journal)) {
      throw new CloseOperationError(
        'CLOSE_RECOVERY_REQUIRED',
        'Close reservation was not durably verified.',
      );
    }

    return { journal: stored, existing: false };
  });
}

function assertMatchingRequest(
  journal: CloseJournal,
  request: CloseRequest & { readonly operationId: string },
): void {
  if (
    journal.plan.kind !== request.kind ||
    (request.kind === 'workspace-close'
      ? journal.plan.workspaceId !== request.workspaceId
      : journal.plan.specId !== request.specId)
  ) {
    throw new CloseOperationError(
      'CLOSE_CONFLICT',
      'OperationId belongs to another lifecycle intent.',
    );
  }

  if (journal.plan.gitOff) {
    if (
      request.kind === 'specification-close' &&
      // With Git off a Close only archives: omitting the option or `false` replays it, `true` never.
      (request.integrateToTargetBranch === true ||
        (journal.plan.source.instanceId === undefined &&
          request.integrateToTargetBranch !== undefined) ||
        // finishAfterExternalMerge is excluded for a Git-off Close by the type system
        // (GitOffClosePlan never carries it); requesting it true is a changed immutable selection.
        request.finishAfterExternalMerge === true)
    ) {
      throw new CloseOperationError(
        'CLOSE_CONFLICT',
        'OperationId changed immutable integration selection.',
      );
    }

    return;
  }

  // `journal.plan` is a `GitClosePlan` here (the `gitOff` discriminant narrowed it above).
  if (request.kind === 'specification-close') {
    // The original linked/primary scope is pinned by the journal, not the
    // current registry. Omitting the option is an intentional default, not a
    // wildcard that may replay an archive-only operation.
    const linked = journal.plan.source.instanceId !== undefined;
    const requested = linked ? (request.integrateToTargetBranch ?? true) : false;
    const reserved = linked ? journal.plan.integrateToTargetBranch : false;
    // finishAfterExternalMerge no longer legitimately varies for this kind (owner decision
    // 2026-11-20): the unconditional refusal above means it can never be true here, for either side.
    if ((!linked && request.integrateToTargetBranch !== undefined) || requested !== reserved) {
      throw new CloseOperationError(
        'CLOSE_CONFLICT',
        'OperationId changed immutable integration selection.',
      );
    }
  } else if (
    request.kind === 'worktree-close' &&
    (request.finishAfterExternalMerge ?? false) !== (journal.plan.finishAfterExternalMerge === true)
  ) {
    throw new CloseOperationError(
      'CLOSE_CONFLICT',
      'OperationId changed immutable integration selection.',
    );
  }
}

/**
 * The preview a Close dialog reads before the Close: the pure preview, without a flush. When it
 * refuses a dirty tree while document commits still hold one of the checkouts the request names, it
 * answers DOCUMENT_COMMITS_PENDING as the Close itself would after its flush, so documents Nevo
 * commits (or waits for) are never reported as files to commit by hand. No Git write and no queue
 * pass; the hold read may prune ledger entries that are already committed.
 */
export async function previewWithDocumentHold(
  engine: SpecFlowEngine,
  request: CloseRequest,
): Promise<ClosePlan> {
  try {
    return await previewCloseOperation(engine, request);
  } catch (error) {
    if (error instanceof CloseOperationError && error.code === 'CLOSE_PREFLIGHT') {
      await assertNoDocumentCommitsHold(
        engine,
        await workspacesNamedBy(engine, request),
        await allowanceOfRequest(engine, request),
      );
    }

    throw error;
  }
}

/**
 * The pure preview, retried once after a flush when it refuses a dirty tree: the changes a person
 * saved may be waiting for their commit, and a checkout that is dirty because of Nevo is not a
 * Close problem (ADR 0016 decision 16). The preview itself stays free of Git writes and of the queue.
 * If it still refuses and a document journal holds one of the checkouts the request names, the
 * answer is DOCUMENT_COMMITS_PENDING (it precedes CLOSE_PREFLIGHT); otherwise the preflight error stands.
 */
export async function previewWithDocumentFlush(
  engine: SpecFlowEngine,
  request: CloseRequest,
  options: ReserveCloseOptions,
): Promise<ClosePlan> {
  try {
    return await previewCloseOperation(engine, request);
  } catch (error) {
    if (!(error instanceof CloseOperationError) || error.code !== 'CLOSE_PREFLIGHT') {
      throw error;
    }

    await flushAllCheckouts(engine, options.flush);
    try {
      return await previewCloseOperation(engine, request);
    } catch (second) {
      if (second instanceof CloseOperationError && second.code === 'CLOSE_PREFLIGHT') {
        await assertNoDocumentCommitsHold(
          engine,
          await workspacesNamedBy(engine, request),
          await allowanceOfRequest(engine, request),
        );
      }

      throw second;
    }
  }
}

/**
 * What a Specification Close does not wait for in the ledger: the Specification's own uncommitted
 * execution state (`.execution/**`, `tasks/**`, which its archive commit takes along, owner decision
 * 2026-11-12), plus, for an archive-only/exclusive Close sharing its checkout, each other active
 * Specification's own execution state of ITS own directory (#181, cross-checked against the
 * registry's `specBindings`). Other Close kinds archive nothing and wait for every entry.
 */
async function allowanceOfPlan(
  engine: SpecFlowEngine,
  plan: ClosePlan,
): Promise<UncommittedAllowance | undefined> {
  if (plan.kind !== 'specification-close') {
    return undefined;
  }

  const own = { specId: plan.specId, directory: 'specs/active/' + plan.slug };
  if (plan.gitOff) {
    return { directories: [own] };
  }

  const registry = await engine.readRegistry();
  const siblings = await siblingSpecificationDirectories(
    plan.source.root,
    plan.source.workspaceId,
    registry,
    plan.specId,
  );

  return { directories: [own, ...siblings] };
}

/** {@link allowanceOfPlan} before the plan exists (the preview refused). */
async function allowanceOfRequest(
  engine: SpecFlowEngine,
  request: CloseRequest,
): Promise<UncommittedAllowance | undefined> {
  if (request.kind !== 'specification-close') {
    return undefined;
  }

  const found = await resolveSpecification(engine, request.specId).catch(() => undefined);
  if (found?.status !== 'available' || found.specification.location !== 'active') {
    return undefined;
  }

  const own = { specId: request.specId, directory: 'specs/active/' + found.specification.slug };
  const registry = await engine.readRegistry();
  const binding = registry.specBindings.find((item) => item.specId === request.specId);
  const workspace =
    binding !== undefined
      ? registry.workspaces.find((item) => item.workspaceId === binding.workspaceId)
      : undefined;
  if (binding === undefined || workspace === undefined) {
    return { directories: [own] };
  }

  const siblings = await siblingSpecificationDirectories(
    workspace.root,
    binding.workspaceId,
    registry,
    request.specId,
  );

  return { directories: [own, ...siblings] };
}

/** The checkouts a Close request can touch before its plan exists: the source and the primary. */
async function workspacesNamedBy(
  engine: SpecFlowEngine,
  request: CloseRequest,
): Promise<readonly string[]> {
  const registry = await engine.readRegistry();
  const source =
    request.kind === 'workspace-close'
      ? request.workspaceId
      : registry.specBindings.find((binding) => binding.specId === request.specId)?.workspaceId;

  return [...(source !== undefined ? [source] : []), registry.primaryWorkspaceId];
}
