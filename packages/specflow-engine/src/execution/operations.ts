import { isDeepStrictEqual } from 'node:util';
import type { SpecFlowEngine } from '../application';
import { withProjectControlLock } from '../project/control-lock';
import { readWorkspaceRegistry } from '../project/workspace/registry/registry';
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

function workspaceOf(engine: SpecFlowEngine) {
  return {
    workspaceId: engine.workspace.workspaceId,
    root: engine.workspace.root,
    ...(engine.workspace.instanceId ? { instanceId: engine.workspace.instanceId } : {}),
  };
}
function matching(
  engine: SpecFlowEngine,
  record: WorkspaceExecutionJournal,
  intent: WorkspaceExecutionIntent,
) {
  if (
    !isDeepStrictEqual(record.intent, intent) ||
    !isDeepStrictEqual(record.workspace, workspaceOf(engine))
  )
    throw new WorkspaceExecutionError(
      'EXECUTION_CONFLICT',
      'Execution identity or workspace binding changed.',
    );
}
function assertCurrentWorkspace(engine: SpecFlowEngine, registry: WorkspaceRegistry) {
  const current = registry.workspaces.find(
    (item) => item.workspaceId === engine.workspace.workspaceId,
  );
  if (current?.root !== engine.workspace.root || current.instanceId !== engine.workspace.instanceId)
    throw new WorkspaceExecutionError('EXECUTION_CONFLICT', 'Workspace incarnation changed.');
}
/** A durable claim precedes any native process or side effect; retries only read the same claim. */
export async function admitWorkspaceExecution(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
): Promise<WorkspaceExecutionJournal> {
  validateExecutionIntent(intent);
  const registry = await engine.readRegistry();
  assertCurrentWorkspace(engine, registry);
  return withProjectControlLock(engine.context, async () => {
    const existing = await readExecutionJournal(engine.context, intent.operationId);
    if (existing) {
      matching(engine, existing, intent);
      return existing;
    }
    const latest = await readWorkspaceRegistry(engine.context);
    assertCurrentWorkspace(engine, latest);
    if (latest.revision !== registry.revision)
      throw new WorkspaceExecutionError(
        'EXECUTION_CONFLICT',
        'Workspace registry changed before execution admission.',
      );
    const record: WorkspaceExecutionJournal = {
      version: 1,
      projectId: engine.context.project.projectId,
      gitInstanceId: engine.context.project.gitInstanceId,
      intent: structuredClone(intent),
      workspace: workspaceOf(engine),
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
  update: (record: WorkspaceExecutionJournal) => WorkspaceExecutionJournal,
): Promise<WorkspaceExecutionJournal> {
  validateExecutionIntent(intent);
  await engine.readRegistry();
  return withProjectControlLock(engine.context, async () => {
    const record = await readExecutionJournal(engine.context, intent.operationId);
    if (!record)
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Execution admission is missing.',
      );
    matching(engine, record, intent);
    const latest = await readWorkspaceRegistry(engine.context);
    assertCurrentWorkspace(engine, latest);
    if (latest.revision !== record.registryRevision)
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Registry changed while an execution claim was held.',
      );
    const result = update(record);
    if (!isDeepStrictEqual(result, record)) await publishExecutionJournal(engine.context, result);
    return result;
  });
}
/** Runtime must await this boundary BEFORE invoking the provider driver. */
export function markWorkspaceExecutionDispatched(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
) {
  return transition(engine, intent, (record) => {
    if (record.phase !== 'admitted')
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Execution cannot dispatch in its current phase.',
      );
    return { ...record, phase: 'dispatched' };
  });
}
export function markWorkspaceExecutionUnknown(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
) {
  return transition(engine, intent, (record) =>
    record.phase === 'settled' ? record : { ...record, phase: 'unknown' },
  );
}
/** Only an admission whose native-process boundary was never crossed can be abandoned without a receipt. */
export function abandonWorkspaceExecutionAdmission(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
) {
  return transition(engine, intent, (record) => {
    if (record.phase === 'settled' && record.settlement?.kind === 'not-dispatched') return record;
    if (record.phase !== 'admitted')
      throw new WorkspaceExecutionError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Possibly dispatched execution requires positive settlement evidence.',
      );
    return { ...record, phase: 'settled', settlement: { kind: 'not-dispatched' } };
  });
}
/** Trusted Runtime boundary only: no HTTP force-success/failure operation is exposed. */
export function settleWorkspaceExecution(
  engine: SpecFlowEngine,
  intent: WorkspaceExecutionIntent,
  receipt: WorkspaceExecutionReceipt,
) {
  validateExecutionReceipt(receipt);
  if (receipt.invocationId !== intent.operationId)
    throw new WorkspaceExecutionError(
      'EXECUTION_CONFLICT',
      'Settlement belongs to another invocation.',
    );
  return transition(engine, intent, (record) => {
    const settlement = { kind: 'native-result' as const, receipt: structuredClone(receipt) };
    if (record.phase === 'settled') {
      if (!isDeepStrictEqual(record.settlement, settlement))
        throw new WorkspaceExecutionError(
          'EXECUTION_CONFLICT',
          'Settled execution receipt cannot change.',
        );
      return record;
    }
    if (record.phase === 'admitted')
      throw new WorkspaceExecutionError(
        'EXECUTION_CONFLICT',
        'Undispatched execution cannot have a native result.',
      );
    return { ...record, phase: 'settled', settlement };
  });
}
