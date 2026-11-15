import { isDeepStrictEqual } from 'node:util';
import type { SpecFlowEngine } from '../application';
import { withProjectControlLock } from '../project/control-lock';
import { readWorkspaceRegistry, verifyWorkspaceRoot } from '../project/workspace/registry/registry';
import type { WorkspaceRegistry } from '../project/workspace/registry/types';
import { assertSharedResourcesAvailable } from '../specs/coordination/resources';
import { publishExecutionJournal, readExecutionJournal } from './journal';
import {
  executionResources,
  validateExecutionIntent,
  validateExecutionReceipt,
  WorkspaceExecutionError,
  type WorkspaceExecutionIntent,
  type WorkspaceExecutionJournal,
  type WorkspaceExecutionReceipt,
} from './model';

/**
 * Where the execution runs: the Engine's own checkout by default, or another registered workspace
 * of the project (a Specification's worktree) named by id. The claim's resource is project-wide
 * either way; only the workspace it is bound to differs.
 */
export interface WorkspaceExecutionTarget {
  readonly workspaceId?: string;
}

type ClaimWorkspace = WorkspaceExecutionJournal['workspace'];

/** The claimed workspace as the registry holds it now; an unknown id is a conflict. */
function targetWorkspace(
  engine: SpecFlowEngine,
  registry: WorkspaceRegistry,
  target: WorkspaceExecutionTarget,
): ClaimWorkspace {
  const workspaceId = target.workspaceId ?? engine.workspace.workspaceId;
  const registered = registry.workspaces.find((item) => item.workspaceId === workspaceId);
  if (!registered) {
    throw new WorkspaceExecutionError('EXECUTION_CONFLICT', 'Workspace incarnation changed.');
  }

  // The Engine's own checkout must still be the incarnation it was opened in.
  if (
    workspaceId === engine.workspace.workspaceId &&
    (registered.root !== engine.workspace.root ||
      registered.instanceId !== engine.workspace.instanceId)
  ) {
    throw new WorkspaceExecutionError('EXECUTION_CONFLICT', 'Workspace incarnation changed.');
  }

  return {
    workspaceId: registered.workspaceId,
    root: registered.root,
    ...(registered.instanceId ? { instanceId: registered.instanceId } : {}),
  };
}

function matching(
  record: WorkspaceExecutionJournal,
  intent: WorkspaceExecutionIntent,
  workspace: ClaimWorkspace,
) {
  if (
    !isDeepStrictEqual(record.intent, intent) ||
    !isDeepStrictEqual(record.workspace, workspace)
  ) {
    throw new WorkspaceExecutionError(
      'EXECUTION_CONFLICT',
      'Execution identity or workspace binding changed.',
    );
  }
}

/** The registered workspace still is the incarnation the claim names. */
function assertSameIncarnation(
  engine: SpecFlowEngine,
  registry: WorkspaceRegistry,
  target: WorkspaceExecutionTarget,
  expected: ClaimWorkspace,
) {
  if (!isDeepStrictEqual(targetWorkspace(engine, registry, target), expected)) {
    throw new WorkspaceExecutionError('EXECUTION_CONFLICT', 'Workspace incarnation changed.');
  }
}

/** A durable claim precedes any native process or side effect; retries only read the same claim. */
export async function admitWorkspaceExecution(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
  target: WorkspaceExecutionTarget = {},
): Promise<WorkspaceExecutionJournal> {
  validateExecutionIntent(intent);
  const registry = await engine.readRegistry();
  const workspace = targetWorkspace(engine, registry, target);
  if (workspace.workspaceId !== engine.workspace.workspaceId) {
    // Another checkout than the Engine's own: verified on disk and in Git before it is claimed.
    const registered = registry.workspaces.find(
      (item) => item.workspaceId === workspace.workspaceId,
    )!;
    try {
      await verifyWorkspaceRoot(engine.context, registered.root, registered);
    } catch {
      throw new WorkspaceExecutionError(
        'EXECUTION_CONFLICT',
        'The execution workspace is not available.',
      );
    }
  }

  return withProjectControlLock(engine.context, async () => {
    const existing = await readExecutionJournal(engine.context, intent.operationId);
    if (existing) {
      matching(existing, intent, workspace);

      return existing;
    }

    const latest = await readWorkspaceRegistry(engine.context);
    assertSameIncarnation(engine, latest, target, workspace);
    if (latest.revision !== registry.revision) {
      throw new WorkspaceExecutionError(
        'EXECUTION_CONFLICT',
        'Workspace registry changed before execution admission.',
      );
    }

    const record: WorkspaceExecutionJournal = {
      version: 1,
      projectId: engine.context.project.projectId,
      gitInstanceId: engine.context.project.gitInstanceId,
      intent: structuredClone(intent),
      workspace,
      registryRevision: registry.revision,
      resources: [...executionResources(engine.context)],
      phase: 'admitted',
    };
    await assertSharedResourcesAvailable(engine.context, record.resources, {
      kind: 'external',
      operationId: intent.operationId,
    });
    await publishExecutionJournal(engine.context, record);

    return record;
  });
}

async function transition(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
  target: WorkspaceExecutionTarget,
  update: (record: WorkspaceExecutionJournal) => WorkspaceExecutionJournal,
): Promise<WorkspaceExecutionJournal> {
  validateExecutionIntent(intent);
  const workspace = targetWorkspace(engine, await engine.readRegistry(), target);

  return withProjectControlLock(engine.context, async () => {
    const record = await readExecutionJournal(engine.context, intent.operationId);
    if (!record) {
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Execution admission is missing.',
      );
    }

    matching(record, intent, workspace);
    const latest = await readWorkspaceRegistry(engine.context);
    assertSameIncarnation(engine, latest, target, workspace);
    if (latest.revision !== record.registryRevision) {
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Registry changed while an execution claim was held.',
      );
    }

    const result = update(record);
    if (!isDeepStrictEqual(result, record)) {
      await publishExecutionJournal(engine.context, result);
    }

    return result;
  });
}

/** Runtime must await this boundary BEFORE invoking the provider driver. */
export function markWorkspaceExecutionDispatched(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
  target: WorkspaceExecutionTarget = {},
) {
  return transition(engine, intent, target, (record) => {
    if (record.phase !== 'admitted') {
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Execution cannot dispatch in its current phase.',
      );
    }

    return { ...record, phase: 'dispatched' };
  });
}

export function markWorkspaceExecutionUnknown(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
  target: WorkspaceExecutionTarget = {},
) {
  return transition(engine, intent, target, (record) =>
    record.phase === 'settled' ? record : { ...record, phase: 'unknown' },
  );
}

/** Only an admission whose native-process boundary was never crossed can be abandoned without a receipt. */
export function abandonWorkspaceExecutionAdmission(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
  target: WorkspaceExecutionTarget = {},
) {
  return transition(engine, intent, target, (record) => {
    if (record.phase === 'settled' && record.settlement?.kind === 'not-dispatched') {
      return record;
    }

    if (record.phase !== 'admitted') {
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Possibly dispatched execution requires positive settlement evidence.',
      );
    }

    return { ...record, phase: 'settled', settlement: { kind: 'not-dispatched' } };
  });
}

/** Trusted Runtime boundary only: no HTTP force-success/failure operation is exposed. */
export function settleWorkspaceExecution(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
  receipt: WorkspaceExecutionReceipt,
  target: WorkspaceExecutionTarget = {},
) {
  validateExecutionReceipt(receipt);
  if (receipt.invocationId !== intent.operationId) {
    throw new WorkspaceExecutionError(
      'EXECUTION_CONFLICT',
      'Settlement belongs to another invocation.',
    );
  }

  return transition(engine, intent, target, (record) => {
    const settlement = { kind: 'native-result' as const, receipt: structuredClone(receipt) };
    if (record.phase === 'settled') {
      if (!isDeepStrictEqual(record.settlement, settlement)) {
        throw new WorkspaceExecutionError(
          'EXECUTION_CONFLICT',
          'Settled execution receipt cannot change.',
        );
      }

      return record;
    }

    if (record.phase === 'admitted') {
      throw new WorkspaceExecutionError(
        'EXECUTION_CONFLICT',
        'Undispatched execution cannot have a native result.',
      );
    }

    return { ...record, phase: 'settled', settlement };
  });
}
