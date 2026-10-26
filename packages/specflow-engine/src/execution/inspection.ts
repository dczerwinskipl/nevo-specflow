import type { SpecFlowEngine } from '../application';
import { verifyProjectHomeOnDisk } from '../project/disk-verification';
import { listExecutionJournals, readExecutionJournal } from './journal';
import { WorkspaceExecutionError, type WorkspaceExecutionJournal } from './model';

/** Project diagnostics remain available even when the old execution workspace is gone. */
export async function inspectWorkspaceExecution(engine: SpecFlowEngine, operationId: string) {
  await verifyProjectHomeOnDisk(engine.context);
  return readExecutionJournal(engine.context, operationId);
}
/** Bounded read-only diagnostics, never a release/dispatch fencing proof. */
export async function listUnsettledWorkspaceExecutions(
  engine: SpecFlowEngine,
  options: { limit?: number; after?: string } = {},
) {
  const limit = options.limit ?? 40;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (options.after !== undefined && !/^[0-9a-f-]{36}$/.test(options.after))
  )
    throw new WorkspaceExecutionError('EXECUTION_CONFLICT', 'Invalid execution inspection page.');
  await verifyProjectHomeOnDisk(engine.context);
  const records: WorkspaceExecutionJournal[] = [];
  for await (const record of listExecutionJournals(engine.context)) {
    if (options.after && record.intent.operationId <= options.after) continue;
    records.push(record);
    records.sort((left, right) => left.intent.operationId.localeCompare(right.intent.operationId));
    if (records.length > limit + 1) records.pop();
  }
  const more = records.length > limit;
  if (more) records.pop();
  return { items: records, ...(more ? { nextAfter: records.at(-1)!.intent.operationId } : {}) };
}
