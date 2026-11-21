import { ANY_TASK_TYPE } from '@nevo/specflow-contracts/documents';
import { findStep } from '@nevo/workflow';

import { WorkflowError } from '../../errors';
import {
  executionTasks,
  loadSubject,
  type WorkflowDependencies,
} from '../../operations/loaded-execution';
import { compileStepContext, type StepContext } from '../../operations/step-context';
import { forOneRead } from '../../operations/task-references';
import type { WorkflowSubject } from '../../state/model';
import { gatherAgentContext, type AgentContextSource } from './gather';

/**
 * The step context of the active attempt of a subject, with the agent data (D13): what
 * `nevo-specflow workflow context` prints and the Runtime renders the brief from. Read-only: it runs
 * no gate, writes nothing and starts nothing; a subject without an active step is refused
 * (`WORKFLOW_POSITION_INVALID`).
 */
export function readStepContext(
  dependencies: WorkflowDependencies,
  source: AgentContextSource,
  subject: WorkflowSubject,
): Promise<StepContext> {
  return dependencies.serialize(async () => {
    const reading = forOneRead(dependencies);
    const snapshot = await dependencies.store.read(subject.specId);
    const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
    const position = loaded.run.position;
    const step =
      position.state === 'active' ? findStep(loaded.definition, position.step) : undefined;
    if (position.state !== 'active' || step?.kind !== 'work') {
      throw new WorkflowError(
        'WORKFLOW_POSITION_INVALID',
        'No step is active: start the next step first.',
      );
    }

    return compileStepContext({
      subject,
      run: loaded.run,
      definition: loaded.definition,
      step,
      attempt: position.attempt,
      catalogue: dependencies.catalogue,
      ...(loaded.task ? { task: loaded.task } : {}),
      agent: await gatherAgentContext(reading, source, subject, loaded.task),
      allowedTaskTypes: snapshot.specification?.value.taskTypes ?? [ANY_TASK_TYPE],
      ...executionTasks(dependencies.catalogue, snapshot),
    });
  });
}

/**
 * The digest of a subject's resolved agent context (D13), read before its agent attempt starts so the
 * start records it on the attempt: the Task's resolved context entries; `undefined` for a
 * Specification subject (its context holds no resolved references). Read-only, any position.
 */
export function readAgentContextDigest(
  dependencies: WorkflowDependencies,
  source: AgentContextSource,
  subject: WorkflowSubject,
): Promise<string | undefined> {
  return dependencies.serialize(async () => {
    if (subject.kind !== 'task') {
      return undefined;
    }

    const snapshot = await dependencies.store.read(subject.specId);
    const task = loadSubject(dependencies.catalogue, snapshot, subject).task;
    const agent = await gatherAgentContext(forOneRead(dependencies), source, subject, task);

    return agent.taskContext?.digest;
  });
}
