import {
  abandonSpecification,
  confirmAgentResult,
  finishStep,
  rejectAgentResult,
  inspectActionsForRead,
  readWorkflowHistory,
  reevaluateWait,
  retryAgentAttemptCommit,
  returnToStep,
  startSpecificationExecution,
  startTaskExecution,
  type AgentAttemptDependencies,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import { WorkflowUnavailableError } from './refusal';

import type { WorkflowPort } from './port';

/**
 * The Engine behind the workflow routes. The workflow operations are opened for each call: a
 * project Runtime loads its definitions each time, so an edit of a workflow, a task type or an
 * archetype is seen by the next request; the demo Runtime answers from its in-memory state.
 */
export function createEngineWorkflowPort(
  open: () => Promise<WorkflowDependencies>,
  /** The agent attempt operations (Retry commit); absent, that route answers 503. */
  openAgentAttempts?: () => Promise<AgentAttemptDependencies>,
): WorkflowPort {
  return {
    async actions(subject) {
      return inspectActionsForRead(await open(), subject);
    },

    async start({ subject, actor, expectedWorkflowRevision }) {
      const workflow = await open();
      if (subject.kind === 'task') {
        return startTaskExecution(workflow, {
          specId: subject.specId,
          taskId: subject.taskId,
          actor,
          ...(expectedWorkflowRevision !== undefined ? { expectedWorkflowRevision } : {}),
        });
      }

      // The archetype of the Specification's manifest; an unknown Specification is
      // `WORKFLOW_SUBJECT_NOT_FOUND`.
      return startSpecificationExecution(workflow, {
        specId: subject.specId,
        archetype: await workflow.references.archetype(subject.specId),
        actor,
      });
    },

    async finish(input) {
      return finishStep(await open(), input);
    },

    async return(input) {
      // Without the agent attempt operations (the demo) no agent attempt exists: it applies now.
      return { kind: 'returned', ...(await returnToStep(await open(), input)) };
    },

    async history(subject) {
      if (!openAgentAttempts) {
        return readWorkflowHistory(await open(), subject);
      }

      const attempts = await openAgentAttempts();

      return readWorkflowHistory(await open(), subject, {
        journal: (attemptId) => attempts.journal.read(attemptId),
        ledger: (workspaceId, specId) => attempts.ledger(workspaceId, specId),
        specification: (workspaceId, specId) => attempts.specification(workspaceId, specId),
      });
    },

    async reevaluateWait(input) {
      return reevaluateWait(await open(), input);
    },

    async abandon(input) {
      return abandonSpecification(await open(), input);
    },

    async retryAttemptCommit(input) {
      if (!openAgentAttempts) {
        throw new WorkflowUnavailableError();
      }

      return retryAgentAttemptCommit(await openAgentAttempts(), input);
    },

    async confirm(input) {
      if (!openAgentAttempts) {
        throw new WorkflowUnavailableError();
      }

      return confirmAgentResult(await openAgentAttempts(), input);
    },

    async reject(input) {
      if (!openAgentAttempts) {
        throw new WorkflowUnavailableError();
      }

      return rejectAgentResult(await openAgentAttempts(), input);
    },
  };
}
