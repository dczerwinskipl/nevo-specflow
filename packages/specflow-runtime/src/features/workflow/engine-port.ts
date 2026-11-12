import {
  WorkflowError,
  abandonSpecification,
  finishStep,
  inspectActionsForRead,
  openWorkflow,
  resolveSpecification,
  returnToStep,
  startSpecificationExecution,
  startTaskExecution,
  type SpecFlowEngine,
  type WorkflowDependencies,
} from '@nevo/specflow-engine';

import type { WorkflowPort } from './port';

/**
 * The Engine behind the workflow routes. The definitions are loaded for each call, so an edit of a
 * workflow, a task type or an archetype is seen by the next request; `open` is how (the Runtime adds
 * the project-document lookup of its docs corpus).
 */
export function createEngineWorkflowPort(
  engine: SpecFlowEngine,
  open: () => Promise<WorkflowDependencies> = () => openWorkflow(engine),
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
