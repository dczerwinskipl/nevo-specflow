import type { WorkflowEffect } from '@nevo/specflow-contracts/documents';

import type * as core from '@nevo/workflow';

/**
 * Resolved execution definitions: workflows, agent archetypes and task types, as the kind registry
 * builds them from `.nevo/definitions/{workflow,agent-archetype,task-type}/`. Defaults of the file
 * format are applied here, so progression code never re-derives them.
 *
 * A workflow is a compiled core definition (`../core`) carrying the SpecFlow annotations below,
 * which only the SpecFlow adapter interprets. Its wait-step triggers are the Task events
 * `tasks-finished` and `task-escalated`.
 */

export const WORKFLOW_KIND = 'workflow';
export const AGENT_ARCHETYPE_KIND = 'agent-archetype';
export const TASK_TYPE_KIND = 'task-type';

/** The Task types a Specification may create: `['*']` for any, otherwise the allowed ids. */
export type TaskTypes = readonly ['*'] | readonly string[];

export type WorkflowSubjectKind = 'specification' | 'task';

/** What SpecFlow declares on a workflow, beyond the neutral definition. */
export interface SpecFlowAnnotations extends core.HostAnnotations {
  readonly definition: { readonly subject: WorkflowSubjectKind };
  readonly work: {
    /** The preferred agent archetype; named exactly when an agent may do the step. */
    readonly archetype?: string;
    readonly interaction: 'interactive' | 'autonomous';
    readonly produces?: 'tasks';
  };
  readonly wait: Readonly<Record<string, never>>;
  readonly transition: {
    readonly session: 'fresh' | 'reuse';
    readonly effects: readonly WorkflowEffect[];
    /** Task workflows only: the finish puts the Task on hold and escalates to the Specification. */
    readonly escalate: boolean;
  };
  readonly return: { readonly effects: readonly WorkflowEffect[] };
}

export type WorkflowDefinition = core.WorkflowDefinition<SpecFlowAnnotations>;
export type WorkflowStep = core.WorkflowStep<SpecFlowAnnotations>;
export type WorkStep = core.WorkStep<SpecFlowAnnotations>;
export type WaitStep = core.WaitStep<SpecFlowAnnotations>;
export type WorkflowTransition = core.WorkflowTransition<SpecFlowAnnotations>;
export type WorkflowReturn = core.WorkflowReturn<SpecFlowAnnotations>;

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

export function providerOf(
  archetype: AgentArchetype,
  provider: string,
): AgentArchetypeProvider | undefined {
  return archetype.providers.find((entry) => entry.provider === provider);
}
