import {
  AgentArchetypeDefinitionFileSchema,
  TaskTypeDefinitionFileSchema,
  WorkflowDefinitionFileSchema,
  findAgentArchetypeFileLimitViolations,
  findTaskTypeFileLimitViolations,
  findWorkflowFileLimitViolations,
  type AgentArchetypeDefinitionFile,
  type TaskTypeDefinitionFile,
  type WorkflowDefinitionFile,
  type WorkflowTransitionFile,
} from '@nevo/specflow-contracts/documents';

import {
  defineDefinitionKind,
  type DefinitionCheckContext,
  type DefinitionIssue,
} from '../../specs/definitions/kind-registry';
import {
  AGENT_ARCHETYPE_KIND,
  TASK_TYPE_KIND,
  WORKFLOW_KIND,
  type AgentArchetype,
  type TaskType,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowTransition,
} from './model';
import { checkWorkflow } from './workflow-rules';

/** Definitions of one kind that load per project. */
const WORKFLOWS_MAX = 50;
const AGENT_ARCHETYPES_MAX = 50;
const TASK_TYPES_MAX = 100;

function definitionReferenceIssue(
  context: DefinitionCheckContext,
  kind: string,
  id: string,
  location: string,
): DefinitionIssue | undefined {
  const found = context.lookup(kind, id);
  if (found.state === 'valid') {
    return undefined;
  }

  return {
    code: found.state === 'missing' ? 'reference-missing' : 'reference-invalid',
    location,
    message:
      found.state === 'missing'
        ? `The ${kind} "${id}" is not defined.`
        : `The ${kind} "${id}" is defined but invalid.`,
  };
}

function parseTransition(file: WorkflowTransitionFile): WorkflowTransition {
  return {
    id: file.id,
    ...(file.result !== undefined ? { result: file.result } : {}),
    ...(file.label !== undefined ? { label: file.label } : {}),
    target:
      'step' in file.to
        ? { kind: 'step', step: file.to.step }
        : { kind: 'terminal', outcome: file.to.terminal },
    continuation: file.continuation ?? 'owner-action',
    session: file.session ?? 'fresh',
    feedback: file.feedback ?? 'optional',
    effects: file.effects ?? [],
    escalate: file.escalate ?? false,
    ...(file.on !== undefined ? { on: file.on } : {}),
  };
}

function parseStep(file: WorkflowDefinitionFile['steps'][number]): WorkflowStep {
  const common = {
    id: file.id,
    title: file.title,
    purpose: file.purpose,
    ...(file.instructions !== undefined ? { instructions: file.instructions } : {}),
    transitions: file.transitions.map(parseTransition),
  };
  if (file.kind === 'wait-for-tasks') {
    // A wait-step transition without a trigger is the one taken when the Tasks are finished.
    return {
      ...common,
      kind: 'wait-for-tasks',
      transitions: common.transitions.map((transition) => ({
        ...transition,
        on: transition.on ?? 'tasks-finished',
      })),
    };
  }

  return {
    ...common,
    kind: 'work',
    executor: file.executor,
    ...(file.archetype !== undefined ? { archetype: file.archetype } : {}),
    interaction: file.interaction ?? 'autonomous',
    ...(file.produces !== undefined ? { produces: file.produces } : {}),
  };
}

export function parseWorkflowFile(file: WorkflowDefinitionFile): WorkflowDefinition {
  return {
    id: file.id,
    version: file.version,
    title: file.title,
    description: file.description,
    subject: file.subject,
    entryStep: file.entryStep,
    steps: file.steps.map(parseStep),
    returns: (file.returns ?? []).map((entry) => ({
      step: entry.step,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      feedback: entry.feedback ?? 'required',
      effects: entry.effects ?? [],
    })),
  };
}

/**
 * The kind `workflow`: one file is one deterministic workflow of a Specification or a Task. The agent
 * archetypes of its steps are not checked here: they are resolved when a step is continued, and a
 * missing one becomes the attention item `archetype-missing`, so a broken archetype file never takes
 * the workflow (and everything that refers to it) down. They are still references, so installing a
 * workflow installs its archetypes.
 */
export const workflowKind = defineDefinitionKind<WorkflowDefinitionFile, WorkflowDefinition>({
  kind: WORKFLOW_KIND,
  auxiliaryDirectories: [],
  dependsOn: [],
  schemaVersions: [1],
  maxEntities: WORKFLOWS_MAX,
  schema: () => WorkflowDefinitionFileSchema,
  textLimitViolations: findWorkflowFileLimitViolations,
  auxiliaryFiles: () => [],
  parse: parseWorkflowFile,
  check: (workflow) => checkWorkflow(workflow),
  references: (workflow) =>
    [
      ...new Set(
        workflow.steps.flatMap((step) =>
          step.kind === 'work' && step.archetype !== undefined ? [step.archetype] : [],
        ),
      ),
    ]
      .sort()
      .map((id) => ({ kind: AGENT_ARCHETYPE_KIND, id })),
});

/** The kind `agent-archetype`: who works on a step, with a preferred provider and a model per provider. */
export const agentArchetypeKind = defineDefinitionKind<
  AgentArchetypeDefinitionFile,
  AgentArchetype
>({
  kind: AGENT_ARCHETYPE_KIND,
  auxiliaryDirectories: [],
  dependsOn: [],
  schemaVersions: [1],
  maxEntities: AGENT_ARCHETYPES_MAX,
  schema: () => AgentArchetypeDefinitionFileSchema,
  textLimitViolations: findAgentArchetypeFileLimitViolations,
  auxiliaryFiles: () => [],
  parse: (file) => ({
    id: file.id,
    title: file.title,
    description: file.description,
    ...(file.profile !== undefined ? { profile: file.profile } : {}),
    ...(file.instructions !== undefined ? { instructions: file.instructions } : {}),
    ...(file.preferredProvider !== undefined ? { preferredProvider: file.preferredProvider } : {}),
    providers: file.providers.map((entry) => ({
      provider: entry.provider,
      ...(entry.model !== undefined ? { model: entry.model } : {}),
      ...(entry.effort !== undefined ? { effort: entry.effort } : {}),
    })),
  }),
  check: (archetype) => {
    const issues: DefinitionIssue[] = [];
    const seen = new Set<string>();
    archetype.providers.forEach((entry, index) => {
      if (seen.has(entry.provider)) {
        issues.push({
          code: 'schema-invalid',
          location: `/providers/${index}/provider`,
          message: `The provider "${entry.provider}" is listed more than once.`,
        });
      }

      seen.add(entry.provider);
    });
    if (archetype.preferredProvider !== undefined && !seen.has(archetype.preferredProvider)) {
      issues.push({
        code: 'schema-invalid',
        location: '/preferredProvider',
        message: `The preferred provider "${archetype.preferredProvider}" is not listed in providers.`,
      });
    }

    return issues;
  },
  references: () => [],
});

/** The kind `task-type`: what a Task is and which workflow it runs. */
export const taskTypeKind = defineDefinitionKind<TaskTypeDefinitionFile, TaskType>({
  kind: TASK_TYPE_KIND,
  auxiliaryDirectories: [],
  dependsOn: [WORKFLOW_KIND],
  schemaVersions: [1],
  maxEntities: TASK_TYPES_MAX,
  schema: () => TaskTypeDefinitionFileSchema,
  textLimitViolations: findTaskTypeFileLimitViolations,
  auxiliaryFiles: () => [],
  parse: (file) => ({
    id: file.id,
    title: file.title,
    description: file.description,
    useWhen: file.useWhen,
    ...(file.instructions !== undefined ? { instructions: file.instructions } : {}),
    workflow: file.workflow,
  }),
  check: (type, context) => {
    const missing = definitionReferenceIssue(context, WORKFLOW_KIND, type.workflow, '/workflow');
    if (missing) {
      return [missing];
    }

    return subjectIssue(context, type.workflow, 'task', '/workflow');
  },
  references: (type) => [{ kind: WORKFLOW_KIND, id: type.workflow }],
});

/** A referenced workflow must drive the expected subject. */
function subjectIssue(
  context: DefinitionCheckContext,
  workflowId: string,
  subject: WorkflowDefinition['subject'],
  location: string,
): DefinitionIssue[] {
  const found = context.lookup(WORKFLOW_KIND, workflowId);
  if (found.state !== 'valid' || (found.entity as WorkflowDefinition).subject === subject) {
    return [];
  }

  return [
    {
      code: 'reference-invalid',
      location,
      message: `The workflow "${workflowId}" does not drive a ${subject}.`,
    },
  ];
}
