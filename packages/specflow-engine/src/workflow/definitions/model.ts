import type { WorkflowEffect, WorkflowGateScope } from '@nevo/specflow-contracts/documents';

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

/**
 * A condition the Engine checks before a step starts (entry) or finishes (exit); `../gates`
 * evaluates it. The only type today is `document`: the scope registers a document of
 * `documentType` whose file exists and has a heading for each of `requiredSections`. The core never
 * reads a gate: it is a SpecFlow annotation of the work step, so it is part of the definition's
 * revision and a run keeps the gates it was pinned with.
 */
export interface DocumentGate {
  /** Unique among the step's gates; `entry-<n>` / `exit-<n>` (from 1) when the file names none. */
  readonly id: string;
  readonly type: 'document';
  readonly label?: string;
  readonly documentType: string;
  /** `subject`: the Task or Specification the run drives; `specification`: its Specification. */
  readonly scope: WorkflowGateScope;
  readonly requiredSections: readonly string[];
}

export type EntryGate = DocumentGate;

export interface ExitGate extends DocumentGate {
  /** Only for the transitions of these results; absent: every transition of the step. */
  readonly when?: readonly string[];
}

/** What SpecFlow declares on a workflow, beyond the neutral definition. */
export interface SpecFlowAnnotations extends core.HostAnnotations {
  readonly definition: { readonly subject: WorkflowSubjectKind };
  readonly work: {
    /** The preferred agent archetype; named exactly when an agent may do the step. */
    readonly archetype?: string;
    readonly interaction: 'interactive' | 'autonomous';
    readonly produces?: 'tasks';
    /**
     * Absent when the step declares none, so a workflow without gates keeps the revision it had
     * before gates existed (its pinned runs stay valid).
     */
    readonly entryGates?: readonly EntryGate[];
    readonly exitGates?: readonly ExitGate[];
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
