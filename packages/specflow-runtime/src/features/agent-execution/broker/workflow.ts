import {
  assertAgentDraftTask,
  createTask,
  editTask,
  proposeAgentFinish,
  removeTask,
  type AgentAttemptDependencies,
  type WorkflowDependencies,
  type OwnedExecution,
} from '@nevo/specflow-engine';

import type { CapabilityBinding } from '../capability/registry';
import type { BrokerWorkflow } from './dispatch';

/**
 * The broker's workflow writes of an agent attempt's Turn: Task drafts of its producing step (create,
 * edit, remove, and the check before a draft's documents are written) and its
 * finish proposal, through the same Engine use cases as the owner's, as the Turn's owned execution
 * with the attempt's agent (from the capability binding, never from the request).
 */
export function createEngineBrokerWorkflow(open: {
  /** The workflow operations whose writes the Turn's claim admits (`ownedExecution`). */
  workflow(owned: OwnedExecution): Promise<WorkflowDependencies>;
  attempts(): Promise<AgentAttemptDependencies>;
}): BrokerWorkflow {
  const attemptOf = (binding: CapabilityBinding) => {
    const attempt = binding.scope.attempt;
    if (attempt === undefined) {
      throw new Error('A workflow write needs the attempt scope.');
    }

    return attempt;
  };

  const owned = (binding: CapabilityBinding): OwnedExecution => ({
    operationId: binding.invocationId,
    actor: binding.actor,
  });

  return {
    async createTask(binding, input) {
      const { attemptId } = attemptOf(binding);
      const result = await createTask(await open.workflow(owned(binding)), {
        ...input,
        actor: binding.actor,
        agentAttempt: { attemptId },
      });

      return { taskId: result.task.taskId, revision: result.revision };
    },
    async editTask(binding, input) {
      const { attemptId } = attemptOf(binding);
      const result = await editTask(await open.workflow(owned(binding)), {
        ...input,
        actor: binding.actor,
        agentAttempt: { attemptId },
      });

      return { taskId: result.task.taskId, revision: result.revision };
    },
    async removeTask(binding, input) {
      const { attemptId } = attemptOf(binding);
      const result = await removeTask(await open.workflow(owned(binding)), {
        ...input,
        actor: binding.actor,
        agentAttempt: { attemptId },
      });

      return { taskId: result.subject.kind === 'task' ? result.subject.taskId : input.taskId };
    },
    async assertDraftTask(binding, specId, taskId) {
      const { attemptId } = attemptOf(binding);
      await assertAgentDraftTask(await open.workflow(owned(binding)), {
        specId,
        taskId,
        actor: binding.actor,
        agentAttempt: { attemptId },
      });
    },
    async propose(binding, request) {
      const attempt = attemptOf(binding);
      const { step: _step, attempt: _attempt, changes, ...input } = request;
      const subject =
        binding.scope.taskId !== undefined
          ? { kind: 'task' as const, specId: binding.specId, taskId: binding.scope.taskId }
          : { kind: 'specification' as const, specId: binding.specId };
      const result = await proposeAgentFinish(await open.attempts(), {
        turn: {
          attemptId: attempt.attemptId,
          invocationId: binding.invocationId,
          actor: binding.actor,
          subject,
          step: attempt.step,
          attempt: attempt.attempt,
        },
        input,
        ...(changes !== undefined ? { changes } : {}),
      });

      return { kind: result.kind, transition: result.proposal.transition };
    },
  };
}
