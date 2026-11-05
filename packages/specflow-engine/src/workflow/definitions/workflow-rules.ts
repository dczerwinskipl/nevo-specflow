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
  if (unconditional.length > 0 && step.transitions.length > 1) {
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

function stepIssues(
  workflow: WorkflowDefinition,
  step: WorkflowStep,
  at: string,
): DefinitionIssue[] {
  if (step.kind === 'wait-for-tasks') {
    if (workflow.subject !== 'specification') {
      return [invalid(`${at}/kind`, 'Only a Specification workflow can wait for Tasks.')];
    }

    // The Engine completes a wait step itself, so it has nothing to choose between and must lead
    // somewhere that is not another wait (entering and leaving waits happen inside one change).
    // It settles the wait without owner input or a Session, so the transition cannot ask for either.
    const [only] = step.transitions;
    const target = only?.target.kind === 'step' ? only.target.step : undefined;
    const next = workflow.steps.find((candidate) => candidate.id === target);
    if (
      step.transitions.length !== 1 ||
      only?.result !== undefined ||
      only?.feedback === 'required' ||
      only?.session === 'reuse' ||
      next?.kind === 'wait-for-tasks'
    ) {
      return [
        invalid(
          `${at}/transitions`,
          'A wait step has exactly one transition without a result, feedback or a reused Session, and it does not lead to another wait step.',
        ),
      ];
    }

    return [];
  }

  const issues: DefinitionIssue[] = [];
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
