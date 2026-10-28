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
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { CloseOperationError, type CloseJournal, type ClosePlan } from './model';
import { readCloseJournal, publishCloseJournal } from './journal/store';
import { assertResourcesAvailable } from './resources';
import { previewCloseOperation, type CloseRequest } from './preflight';

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
  // Document commits of every checkout the Close owns are flushed before the lock is taken (Git runs
  // here, never inside the lock); what is still pending, failed or abandoned refuses the Close.
  // The preview and the preflight stay pure: this is the only effect, and only at admission.
  await flushCheckoutsForClose(
    engine,
    [plan.source, ...(plan.target !== undefined ? [plan.target] : [])],
    options.flush,
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
    if (plan.configRevision !== undefined) {
      const config = await readProjectGitPolicy(engine.context);
      if (
        config.revision !== plan.configRevision ||
        config.policy.integrationTargetBranch !== plan.targetBranch
      ) {
        throw new CloseOperationError(
          'CLOSE_CONFLICT',
          'Project integration policy changed after preview.',
        );
      }
    }
    // A manual-mode save writes no claim: one that landed after the flush above is judged here.
    await assertNoUncommittedHold(
      engine,
      [plan.source, ...(plan.target !== undefined ? [plan.target] : [])].map(
        (checkout) => checkout.workspaceId,
      ),
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
  if (request.kind === 'specification-close') {
    // The original linked/primary scope is pinned by the journal, not the
    // current registry. Omitting the option is an intentional default, not a
    // wildcard that may replay an archive-only operation.
    const linked = journal.plan.source.instanceId !== undefined;
    const requested = linked ? (request.integrateToTargetBranch ?? true) : false;
    const reserved = linked ? journal.plan.integrateToTargetBranch : false;
    if ((!linked && request.integrateToTargetBranch !== undefined) || requested !== reserved) {
      throw new CloseOperationError(
        'CLOSE_CONFLICT',
        'OperationId changed immutable integration selection.',
      );
    }
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
    if (!(error instanceof CloseOperationError) || error.code !== 'CLOSE_PREFLIGHT') throw error;
    await flushAllCheckouts(engine, options.flush);
    try {
      return await previewCloseOperation(engine, request);
    } catch (second) {
      if (second instanceof CloseOperationError && second.code === 'CLOSE_PREFLIGHT') {
        await assertNoDocumentCommitsHold(engine, await workspacesNamedBy(engine, request));
      }
      throw second;
    }
  }
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
