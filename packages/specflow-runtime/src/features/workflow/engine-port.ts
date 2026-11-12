import {
  WorkflowError,
  abandonSpecification,
  finishStep,
  inspectActions,
  openWorkflow,
  resolveSpecification,
  returnToStep,
  startSpecificationExecution,
  startTaskExecution,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

import type { WorkflowPort } from './port';

/**
 * The Engine behind the workflow routes. The definitions are loaded for each call, so an edit of a
 * workflow, a task type or an archetype is seen by the next request.
 */
export function createEngineWorkflowPort(engine: SpecFlowEngine): WorkflowPort {
  return {
    async actions(subject) {
      return inspectActions(await openWorkflow(engine), subject);
    },

    async start({ subject, actor, expectedWorkflowRevision }) {
      const workflow = await openWorkflow(engine);
      if (subject.kind === 'task') {
        return startTaskExecution(workflow, {
          specId: subject.specId,
          taskId: subject.taskId,
          actor,
          ...(expectedWorkflowRevision !== undefined ? { expectedWorkflowRevision } : {}),
        });
      }

      const found = await resolveSpecification(engine, subject.specId);
      if (found.status !== 'available') {
        throw new WorkflowError(
          'WORKFLOW_SUBJECT_NOT_FOUND',
          `The Specification "${subject.specId}" is not available in a registered checkout (${found.status}).`,
        );
      }

      return startSpecificationExecution(workflow, {
        specId: subject.specId,
        archetype: found.specification.archetype.id,
        actor,
      });
    },

    async finish(input) {
      return finishStep(await openWorkflow(engine), input);
    },

    async return(input) {
      return returnToStep(await openWorkflow(engine), input);
    },

    async abandon(input) {
      return abandonSpecification(await openWorkflow(engine), input);
    },
  };
}
