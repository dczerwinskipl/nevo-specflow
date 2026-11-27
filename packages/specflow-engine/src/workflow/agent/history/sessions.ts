import { findStep } from '@nevo/workflow';

import { runReadRequest } from '../../../project/request-verification-memo';
import type { WorkflowDependencies } from '../../operations/loaded-execution';
import type { WorkflowRun, WorkflowSubject } from '../../state/model';

/**
 * The agent attempt a Session was made for: the first attempt of the Specification's runs whose
 * agent actor names the Session (a reused Session also works on later attempts; it was made for
 * the first), with the step's title in the pinned workflow (its id when the workflow no longer
 * defines it) and the Task's title for a Task subject.
 */
export interface AgentSessionOrigin {
  readonly subject: WorkflowSubject;
  readonly step: { readonly id: string; readonly title: string };
  readonly attempt: number;
  readonly task?: { readonly id: string; readonly title: string };
}

/**
 * The agent attempt each agent Session of a Specification was made for, by Session id, read from
 * the committed run records (each attempt records its agent actor and so its Session): a client
 * names an agent step Session "<step> · attempt n" whatever title it was created with. Read-only
 * and lock-free.
 */
export function readAgentSessionOrigins(
  workflow: Pick<WorkflowDependencies, 'catalogue' | 'store'>,
  specId: string,
): Promise<ReadonlyMap<string, AgentSessionOrigin>> {
  return runReadRequest(async () => {
    const snapshot = await workflow.store.read(specId);
    const found = new Map<string, AgentSessionOrigin & { readonly startedAt: string }>();
    const visit = (
      run: WorkflowRun,
      subject: WorkflowSubject,
      task?: { readonly id: string; readonly title: string },
    ) => {
      const definition = workflow.catalogue.workflow(run.workflow.id);
      for (const record of run.attempts) {
        const actor = record.actor;
        const sessionId = actor?.class === 'agent' ? actor.details.sessionId : undefined;
        const known = sessionId === undefined ? undefined : found.get(sessionId);
        if (
          sessionId === undefined ||
          (known !== undefined && known.startedAt <= record.startedAt)
        ) {
          continue;
        }

        found.set(sessionId, {
          subject,
          step: {
            id: record.step,
            title: (definition && findStep(definition, record.step)?.title) ?? record.step,
          },
          attempt: record.attempt,
          ...(task ? { task } : {}),
          startedAt: record.startedAt,
        });
      }
    };

    if (snapshot.specification) {
      visit(snapshot.specification.value.run, { kind: 'specification', specId });
    }

    for (const entry of snapshot.runs) {
      const { taskId, run } = entry.value;
      const title =
        snapshot.manifests.find((manifest) => manifest.value.id === taskId)?.value.title ?? taskId;
      visit(run, { kind: 'task', specId, taskId }, { id: taskId, title });
    }

    return new Map(
      [...found].map(([sessionId, { startedAt: _startedAt, ...origin }]) => [sessionId, origin]),
    );
  });
}
