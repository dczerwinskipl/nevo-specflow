import { activeAttempt, findStep } from '@nevo/workflow';

import { loadSubject, type WorkflowDependencies } from '../../operations/loaded-execution';
import { agentAttemptBindingOf, type WorkflowSubject } from '../../state/model';
import type { AgentAttemptDependencies } from '../dependencies';
import type { AgentAttemptJournal } from '../journal/model';
import { deriveAgentScope, type AgentWriteScope } from './scope';

/**
 * The write scope of a Turn of the agent attempt `attemptId`, derived from what the Engine recorded
 * for it (its journal and the step's definition), never from the request that dispatches the Turn:
 * the attempt's subject and position, and Task drafts only when its step declares `produces: tasks`.
 * `undefined` when no attempt has this id.
 */
export async function agentAttemptScope(
  dependencies: Pick<AgentAttemptDependencies, 'journal' | 'workflow'>,
  attemptId: string,
): Promise<{ readonly scope: AgentWriteScope; readonly journal: AgentAttemptJournal } | undefined> {
  const journal = await dependencies.journal.read(attemptId);
  if (!journal) {
    return undefined;
  }

  const { workflow } = dependencies;
  const snapshot = await workflow.store.read(journal.subject.specId);
  const { definition } = loadSubject(workflow.catalogue, snapshot, journal.subject);
  const step = findStep(definition, journal.step);
  const scope = deriveAgentScope({
    kind: 'attempt',
    specId: journal.subject.specId,
    ...(journal.subject.kind === 'task' ? { taskId: journal.subject.taskId } : {}),
    attemptId,
    step: journal.step,
    attempt: journal.attempt,
    producesTasks: step?.kind === 'work' && step.annotations.produces === 'tasks',
  });

  return { scope, journal };
}

/**
 * The agent attempt the subject's active step is in (started by Ask agent), or `undefined` when no
 * step is active or its attempt is a person's. Read-only and lock-free.
 */
export async function activeAgentAttempt(
  workflow: Pick<WorkflowDependencies, 'catalogue' | 'store'>,
  subject: WorkflowSubject,
): Promise<
  | {
      readonly attemptId: string;
      readonly workspaceId: string;
      readonly step: string;
      readonly attempt: number;
    }
  | undefined
> {
  const snapshot = await workflow.store.read(subject.specId);
  const run = loadSubject(workflow.catalogue, snapshot, subject).run;
  const active = activeAttempt(run);
  const binding = agentAttemptBindingOf(active);

  return active && binding && run.position.state === 'active'
    ? {
        attemptId: binding.attemptId,
        workspaceId: binding.workspaceId,
        step: active.step,
        attempt: active.attempt,
      }
    : undefined;
}
