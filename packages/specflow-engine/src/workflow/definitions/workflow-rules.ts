import type { DefinitionIssue } from '../../specs/definitions/kind-registry';
import type { WorkflowDefinition, WorkflowStep } from './model';

/**
 * Whole-workflow rules the per-file schema cannot express. A workflow that breaks one never loads,
 * so progression code can rely on them: ids are unique, every target exists, a step's transitions
 * are selected by exactly one result, and Specification-only features are not used by a Task.
 */

function invalid(location: string, message: string): DefinitionIssue {
  return { code: 'schema-invalid', location, message };
}

function transitionIssues(
  workflow: WorkflowDefinition,
  step: WorkflowStep,
  at: string,
  stepIds: ReadonlySet<string>,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const ids = new Set<string>();
  const results = new Set<string>();
  const unconditional = step.transitions.filter((transition) => transition.result === undefined);
  if (step.kind === 'work' && unconditional.length > 0 && step.transitions.length > 1) {
    issues.push(
      invalid(
        `${at}/transitions`,
        'A step has either one transition without a result or only transitions with a result.',
      ),
    );
  }

  step.transitions.forEach((transition, index) => {
    const location = `${at}/transitions/${index}`;
    if (ids.has(transition.id)) {
      issues.push(invalid(`${location}/id`, `The transition id "${transition.id}" is repeated.`));
    }

    ids.add(transition.id);
    if (transition.result !== undefined) {
      if (results.has(transition.result)) {
        issues.push(
          invalid(
            `${location}/result`,
            `The result "${transition.result}" selects two transitions.`,
          ),
        );
      }

      results.add(transition.result);
    }

    if (transition.target.kind === 'step' && !stepIds.has(transition.target.step)) {
      issues.push(
        invalid(
          `${location}/to/step`,
          `The target step "${transition.target.step}" is not defined.`,
        ),
      );
    }

    if (transition.effects.length > 0 && workflow.subject !== 'specification') {
      issues.push(
        invalid(`${location}/effects`, 'Only a Specification workflow has Task effects.'),
      );
    }

    if (transition.escalate && workflow.subject !== 'task') {
      issues.push(
        invalid(`${location}/escalate`, 'Only a Task workflow escalates to its Specification.'),
      );
    }

    // The escalated Task waits on hold at the target step, with the feedback as its reason.
    if (
      transition.escalate &&
      (transition.feedback !== 'required' || transition.target.kind !== 'step')
    ) {
      issues.push(
        invalid(
          `${location}/escalate`,
          'An escalating transition requires feedback and leads to a step.',
        ),
      );
    }

    const targetStep = transition.target.kind === 'step' ? transition.target.step : undefined;
    if (transition.session === 'reuse' && targetStep !== undefined) {
      const target = workflow.steps.find((candidate) => candidate.id === targetStep);
      if (target?.kind !== 'work' || target.executor !== 'agent') {
        issues.push(
          invalid(
            `${location}/session`,
            'Only a transition to an agent step can reuse the Session.',
          ),
        );
      }
    }
  });

  return issues;
}

/**
 * The Engine settles a wait step itself, so each transition is selected by a Task event (`on`), not
 * by a result: exactly one `tasks-finished` and at most one `task-escalated`. It settles without a
 * Session and enters the next step in the same change, so no transition reuses the Session or leads
 * to another wait step. `tasks-finished` takes no owner input; `task-escalated` carries the Engine's
 * feedback (every escalated Task with its feedback) to a step.
 */
function waitStepIssues(
  workflow: WorkflowDefinition,
  step: WorkflowStep,
  at: string,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const triggers = new Set<string>();
  step.transitions.forEach((transition, index) => {
    const location = `${at}/transitions/${index}`;
    const target = transition.target.kind === 'step' ? transition.target.step : undefined;
    const next = workflow.steps.find((candidate) => candidate.id === target);
    if (
      transition.result !== undefined ||
      transition.session === 'reuse' ||
      next?.kind === 'wait-for-tasks'
    ) {
      issues.push(
        invalid(
          location,
          'A wait-step transition has no result and no reused Session, and it does not lead to another wait step.',
        ),
      );
    }

    const trigger = transition.on ?? 'tasks-finished';
    if (triggers.has(trigger)) {
      issues.push(invalid(`${location}/on`, `Two transitions are taken on "${trigger}".`));
    }

    triggers.add(trigger);
    if (trigger === 'tasks-finished' && transition.feedback === 'required') {
      issues.push(
        invalid(`${location}/feedback`, 'The transition taken on tasks-finished has no feedback.'),
      );
    }

    if (
      trigger === 'task-escalated' &&
      (transition.feedback !== 'required' || transition.target.kind !== 'step')
    ) {
      issues.push(
        invalid(
          `${location}/on`,
          'The transition taken on task-escalated requires feedback and leads to a step.',
        ),
      );
    }
  });
  if (!triggers.has('tasks-finished')) {
    issues.push(
      invalid(`${at}/transitions`, 'A wait step has a transition taken on tasks-finished.'),
    );
  }

  return issues;
}

function stepIssues(
  workflow: WorkflowDefinition,
  step: WorkflowStep,
  at: string,
): DefinitionIssue[] {
  if (step.kind === 'wait-for-tasks') {
    if (workflow.subject !== 'specification') {
      return [invalid(`${at}/kind`, 'Only a Specification workflow can wait for Tasks.')];
    }

    return waitStepIssues(workflow, step, at);
  }

  const issues: DefinitionIssue[] = [];
  step.transitions.forEach((transition, index) => {
    if (transition.on !== undefined) {
      issues.push(
        invalid(`${at}/transitions/${index}/on`, 'Only a wait-step transition has a trigger.'),
      );
    }
  });
  if (step.executor === 'agent' && step.archetype === undefined) {
    issues.push(invalid(`${at}/archetype`, 'An agent step names its preferred agent archetype.'));
  }

  if (step.executor === 'human' && step.archetype !== undefined) {
    issues.push(invalid(`${at}/archetype`, 'A human step has no agent archetype.'));
  }

  if (step.produces === 'tasks' && workflow.subject !== 'specification') {
    issues.push(invalid(`${at}/produces`, 'Only a Specification workflow produces Tasks.'));
  }

  return issues;
}

export function checkWorkflow(workflow: WorkflowDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const stepIds = new Set<string>();
  workflow.steps.forEach((step, index) => {
    if (stepIds.has(step.id)) {
      issues.push(invalid(`/steps/${index}/id`, `The step id "${step.id}" is repeated.`));
    }

    stepIds.add(step.id);
  });
  if (!stepIds.has(workflow.entryStep)) {
    issues.push(invalid('/entryStep', `The entry step "${workflow.entryStep}" is not defined.`));
  }

  // Starting a run enters its entry step, and nobody can start a wait step.
  if (
    workflow.steps.some((step) => step.id === workflow.entryStep && step.kind === 'wait-for-tasks')
  ) {
    issues.push(invalid('/entryStep', `The entry step "${workflow.entryStep}" is a wait step.`));
  }

  workflow.steps.forEach((step, index) => {
    const at = `/steps/${index}`;
    issues.push(
      ...stepIssues(workflow, step, at),
      ...transitionIssues(workflow, step, at, stepIds),
    );
  });

  const returnSteps = new Set<string>();
  workflow.returns.forEach((entry, index) => {
    const at = `/returns/${index}`;
    if (!stepIds.has(entry.step)) {
      issues.push(invalid(`${at}/step`, `The return step "${entry.step}" is not defined.`));
    }

    // A return always waits for the owner, but nobody can start a wait step: the run would hang.
    if (workflow.steps.some((step) => step.id === entry.step && step.kind === 'wait-for-tasks')) {
      issues.push(invalid(`${at}/step`, `The return step "${entry.step}" is a wait step.`));
    }

    if (returnSteps.has(entry.step)) {
      issues.push(invalid(`${at}/step`, `The return to "${entry.step}" is declared twice.`));
    }

    returnSteps.add(entry.step);
    if (entry.effects.length > 0 && workflow.subject !== 'specification') {
      issues.push(invalid(`${at}/effects`, 'Only a Specification workflow has Task effects.'));
    }
  });

  return issues;
}
