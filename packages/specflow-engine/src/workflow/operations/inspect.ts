import type { AttentionItem } from '../attention/model';
import { handoffOf, type Handoff } from '../progression/progression';
import { taskReadiness, type TaskReadiness } from '../tasks/tasks';
import type { SpecificationExecutionRecord, TaskRecord } from '../state/model';
import type { WorkflowDependencies } from './loaded-execution';

export interface ExecutionInspection {
  readonly specId: string;
  readonly specification?: {
    readonly record: SpecificationExecutionRecord;
    readonly handoff?: Handoff;
  };
  readonly tasks: readonly {
    readonly record: TaskRecord;
    readonly readiness: TaskReadiness;
    readonly handoff?: Handoff;
  }[];
  readonly attention: readonly AttentionItem[];
}

/** Read-only view of a Specification's execution: runs, Task readiness and open attention items. */
export async function inspectExecution(
  dependencies: Pick<WorkflowDependencies, 'store'>,
  specId: string,
): Promise<ExecutionInspection> {
  const snapshot = await dependencies.store.read(specId);
  const tasks = snapshot.tasks.map((entry) => entry.value);
  const specification = snapshot.specification?.value;
  const specificationHandoff = specification ? handoffOf(specification.run) : undefined;

  return {
    specId,
    ...(specification
      ? {
          specification: {
            record: specification,
            ...(specificationHandoff ? { handoff: specificationHandoff } : {}),
          },
        }
      : {}),
    tasks: tasks.map((record) => {
      const handoff = handoffOf(record.run);

      return {
        record,
        readiness: taskReadiness(record, tasks),
        ...(handoff ? { handoff } : {}),
      };
    }),
    attention: snapshot.attention,
  };
}
