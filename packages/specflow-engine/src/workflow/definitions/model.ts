import type { WorkflowEffect } from '@nevo/specflow-contracts/documents';

/**
 * Resolved execution definitions: workflows, agent archetypes and task types, as the kind registry
 * builds them from `.nevo/definitions/{workflow,agent-archetype,task-type}/`. Defaults of the file
 * format are applied here, so progression code never re-derives them.
 */

export const WORKFLOW_KIND = 'workflow';
export const AGENT_ARCHETYPE_KIND = 'agent-archetype';
export const TASK_TYPE_KIND = 'task-type';

export type WorkflowSubjectKind = 'specification' | 'task';
export type TerminalOutcome = 'completed' | 'abandoned';

export type TransitionTarget =
  | { readonly kind: 'step'; readonly step: string }
  | { readonly kind: 'terminal'; readonly outcome: TerminalOutcome };

export interface WorkflowTransition {
  readonly id: string;
  readonly result?: string;
  readonly label?: string;
  readonly target: TransitionTarget;
  readonly continuation: 'auto' | 'owner-action';
  readonly session: 'fresh' | 'reuse';
  readonly feedback: 'required' | 'optional';
  readonly effects: readonly WorkflowEffect[];
}

interface StepCommon {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly instructions?: string;
  readonly transitions: readonly WorkflowTransition[];
}

export interface WorkStep extends StepCommon {
  readonly kind: 'work';
  readonly executor: 'agent' | 'human';
  readonly archetype?: string;
  readonly interaction: 'interactive' | 'autonomous';
  readonly produces?: 'tasks';
}

export interface WaitForTasksStep extends StepCommon {
  readonly kind: 'wait-for-tasks';
}

export type WorkflowStep = WorkStep | WaitForTasksStep;

export interface WorkflowReturn {
  readonly step: string;
  readonly label?: string;
  readonly feedback: 'required' | 'optional';
  readonly effects: readonly WorkflowEffect[];
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly subject: WorkflowSubjectKind;
  readonly entryStep: string;
  readonly steps: readonly WorkflowStep[];
  readonly returns: readonly WorkflowReturn[];
}

export interface AgentArchetypeProvider {
  readonly provider: string;
  readonly model?: string;
  readonly effort?: string;
}

export interface AgentArchetype {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly profile?: string;
  readonly instructions?: string;
  readonly preferredProvider?: string;
  readonly providers: readonly AgentArchetypeProvider[];
}

export interface TaskType {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly useWhen: string;
  readonly instructions?: string;
  readonly workflow: string;
}

export function findStep(definition: WorkflowDefinition, id: string): WorkflowStep | undefined {
  return definition.steps.find((step) => step.id === id);
}

export function providerOf(
  archetype: AgentArchetype,
  provider: string,
): AgentArchetypeProvider | undefined {
  return archetype.providers.find((entry) => entry.provider === provider);
}
