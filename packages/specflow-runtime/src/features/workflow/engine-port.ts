import {
  abandonSpecification,
  finishStep,
  inspectActionsForRead,
  returnToStep,
  startSpecificationExecution,
  startTaskExecution,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import type { WorkflowPort } from './port';

/**
 * The Engine behind the workflow routes. The workflow operations are opened for each call: a
 * project Runtime loads its definitions each time, so an edit of a workflow, a task type or an
 * archetype is seen by the next request; the demo Runtime answers from its in-memory state.
 */
export function createEngineWorkflowPort(open: () => Promise<WorkflowDependencies>): WorkflowPort {
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
      return returnToStep(await open(), input);
    },

    async abandon(input) {
      return abandonSpecification(await open(), input);
    },
  };
}
