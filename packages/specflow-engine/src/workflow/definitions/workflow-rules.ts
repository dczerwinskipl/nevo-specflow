import type { DefinitionIssue } from '../../specs/definitions/kind-registry';
import { checkDefinition, findStep } from '../core';
import type { WorkflowDefinition, WorkflowStep } from './model';

/**
 * Whole-workflow rules the per-file schema cannot express. A workflow that breaks one never loads,
 * so progression code can rely on them. The neutral rules of the core (`checkDefinition`: unique
 * ids, existing targets, one way to select each transition, executors, wait triggers, entry and
 * returns lead to work steps) come first; SpecFlow adds what its annotations mean: who names an
 * archetype, which subject may produce or wait for Tasks, escalation and Session reuse.
 */

function invalid(location: string, message: string): DefinitionIssue {
  return { code: 'schema-invalid', location, message };
}

function transitionIssues(
  workflow: WorkflowDefinition,
  step: WorkflowStep,
  at: string,
): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const subject = workflow.annotations.subject;
  step.transitions.forEach((transition, index) => {
    const location = `${at}/transitions/${index}`;
    const { effects, escalate, session } = transition.annotations;
    if (effects.length > 0 && subject !== 'specification') {
      issues.push(
        invalid(`${location}/effects`, 'Only a Specification workflow has Task effects.'),
      );
    }

    if (escalate && subject !== 'task') {
      issues.push(
        invalid(`${location}/escalate`, 'Only a Task workflow escalates to its Specification.'),
      );
    }

    // The escalated Task waits on hold at the target step, with the feedback as its reason.
    if (escalate && (transition.feedback !== 'required' || transition.target.kind !== 'step')) {
      issues.push(
        invalid(
          `${location}/escalate`,
          'An escalating transition requires feedback and leads to a step.',
        ),
      );
    }

    if (session !== 'reuse') {
      return;
    }

    // The Engine settles a wait step without a Session; only an agent can continue one.
    const target =
      transition.target.kind === 'step' ? findStep(workflow, transition.target.step) : undefined;
    if (
      step.kind === 'wait' ||
      (target !== undefined && (target.kind !== 'work' || !target.executors.includes('agent')))
    ) {
      issues.push(
        invalid(
          `${location}/session`,
          'Only a transition of a work step to a step an agent may do can reuse the Session.',
        ),
      );
    }
  });

  return issues;
}

/**
 * The Engine settles a wait step on a Task event: exactly one `tasks-finished` transition (which
 * takes no owner input) and at most one `task-escalated` (which carries the Engine's feedback naming
 * the escalated Tasks to a step).
 */
function waitStepIssues(step: WorkflowStep, at: string): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  step.transitions.forEach((transition, index) => {
    const location = `${at}/transitions/${index}`;
    if (transition.on === 'tasks-finished' && transition.feedback === 'required') {
      issues.push(
        invalid(`${location}/feedback`, 'The transition taken on tasks-finished has no feedback.'),
      );
    }

    if (
      transition.on === 'task-escalated' &&
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
  if (!step.transitions.some((transition) => transition.on === 'tasks-finished')) {
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
  const subject = workflow.annotations.subject;
  if (step.kind === 'wait') {
    return subject === 'specification'
      ? waitStepIssues(step, at)
      : [invalid(`${at}/kind`, 'Only a Specification workflow can wait for Tasks.')];
  }

  const issues: DefinitionIssue[] = [];
  const agent = step.executors.includes('agent');
  if (agent && step.annotations.archetype === undefined) {
    issues.push(
      invalid(`${at}/archetype`, 'A step an agent may do names its preferred agent archetype.'),
    );
  }

  if (!agent && step.annotations.archetype !== undefined) {
    issues.push(invalid(`${at}/archetype`, 'A human-only step has no agent archetype.'));
  }

  if (step.annotations.produces === 'tasks' && subject !== 'specification') {
    issues.push(invalid(`${at}/produces`, 'Only a Specification workflow produces Tasks.'));
  }

  return issues;
}

export function checkWorkflow(workflow: WorkflowDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = checkDefinition(workflow).map((problem) =>
    invalid(problem.location, problem.message),
  );
  workflow.steps.forEach((step, index) => {
    const at = `/steps/${index}`;
    issues.push(...stepIssues(workflow, step, at), ...transitionIssues(workflow, step, at));
  });
  workflow.returns.forEach((entry, index) => {
    if (entry.annotations.effects.length > 0 && workflow.annotations.subject !== 'specification') {
      issues.push(
        invalid(`/returns/${index}/effects`, 'Only a Specification workflow has Task effects.'),
      );
    }
  });

  return issues;
}
