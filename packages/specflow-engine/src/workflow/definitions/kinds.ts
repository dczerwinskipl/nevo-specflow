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
  type WorkflowEntryGateFile,
  type WorkflowExitGateFile,
  type WorkflowTransitionFile,
} from '@nevo/specflow-contracts/documents';

import {
  defineDefinitionKind,
  type DefinitionCheckContext,
  type DefinitionIssue,
} from '../../specs/definitions/kind-registry';
import { DOCUMENT_TYPE_KIND } from '../../specs/definitions/kinds/document-type';
import {
  AGENT_ARCHETYPE_KIND,
  TASK_TYPE_KIND,
  WORKFLOW_KIND,
  type AgentArchetype,
  type DocumentGate,
  type ExitGate,
  type TaskType,
  type WorkflowDefinition,
  type WorkflowSubjectKind,
  type WorkflowStep,
  type WorkflowTransition,
} from './model';
import { checkWorkflow, stepGates } from './workflow-rules';

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
    feedback: file.feedback ?? 'optional',
    ...(file.on !== undefined ? { on: file.on } : {}),
    annotations: {
      session: file.session ?? 'fresh',
      effects: file.effects ?? [],
      escalate: file.escalate ?? false,
    },
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
      kind: 'wait',
      transitions: common.transitions.map((transition) => ({
        ...transition,
        on: transition.on ?? 'tasks-finished',
      })),
      annotations: {},
    };
  }

  const entryGates = (file.entryGates ?? []).map((gate, index) =>
    parseGate(gate, `entry-${String(index + 1)}`),
  );
  const exitGates = (file.exitGates ?? []).map((gate, index): ExitGate => ({
    ...parseGate(gate, `exit-${String(index + 1)}`),
    ...(gate.when !== undefined ? { when: [...gate.when] } : {}),
  }));

  return {
    ...common,
    kind: 'work',
    executors: [...file.executors],
    annotations: {
      ...(file.archetype !== undefined ? { archetype: file.archetype } : {}),
      interaction: file.interaction ?? 'autonomous',
      ...(file.produces !== undefined ? { produces: file.produces } : {}),
      // Omitted when empty: a workflow without gates keeps its revision.
      ...(entryGates.length > 0 ? { entryGates } : {}),
      ...(exitGates.length > 0 ? { exitGates } : {}),
    },
  };
}

function parseGate(
  file: WorkflowEntryGateFile | WorkflowExitGateFile,
  defaultId: string,
): DocumentGate {
  return {
    id: file.id ?? defaultId,
    type: file.type,
    ...(file.label !== undefined ? { label: file.label } : {}),
    documentType: file.documentType,
    scope: file.scope ?? 'subject',
    requiredSections: [...(file.requiredSections ?? [])],
  };
}

/**
 * A gate names a document type the project defines. Only a missing one is a problem of the
 * workflow: an invalid document-type file does not take the workflow down (no cascade); its gates
 * then never find a document of that type.
 */
function gateDocumentTypeIssues(
  workflow: WorkflowDefinition,
  context: DefinitionCheckContext,
): DefinitionIssue[] {
  return workflow.steps.flatMap((step, index) =>
    stepGates(step).flatMap(({ gate, location }) =>
      context.lookup(DOCUMENT_TYPE_KIND, gate.documentType).state === 'missing'
        ? [
            {
              code: 'reference-missing' as const,
              location: `/steps/${String(index)}${location}/documentType`,
              message: `The document-type "${gate.documentType}" is not defined.`,
            },
          ]
        : [],
    ),
  );
}

export function parseWorkflowFile(file: WorkflowDefinitionFile): WorkflowDefinition {
  return {
    id: file.id,
    version: file.version,
    title: file.title,
    description: file.description,
    entryStep: file.entryStep,
    steps: file.steps.map(parseStep),
    returns: (file.returns ?? []).map((entry) => ({
      step: entry.step,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      feedback: entry.feedback ?? 'required',
      annotations: { effects: entry.effects ?? [] },
    })),
    annotations: { subject: file.subject },
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
  dependsOn: [DOCUMENT_TYPE_KIND],
  schemaVersions: [1],
  maxEntities: WORKFLOWS_MAX,
  schema: () => WorkflowDefinitionFileSchema,
  textLimitViolations: findWorkflowFileLimitViolations,
  auxiliaryFiles: () => [],
  parse: parseWorkflowFile,
  check: (workflow, context) => [
    ...checkWorkflow(workflow),
    ...gateDocumentTypeIssues(workflow, context),
  ],
  references: (workflow) => [
    ...[
      ...new Set(
        workflow.steps.flatMap((step) =>
          step.kind === 'work' && step.annotations.archetype !== undefined
            ? [step.annotations.archetype]
            : [],
        ),
      ),
    ]
      .sort()
      .map((id) => ({ kind: AGENT_ARCHETYPE_KIND, id })),
    ...[
      ...new Set(
        workflow.steps.flatMap((step) => stepGates(step).map(({ gate }) => gate.documentType)),
      ),
    ]
      .sort()
      .map((id) => ({ kind: DOCUMENT_TYPE_KIND, id })),
  ],
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
  subject: WorkflowSubjectKind,
  location: string,
): DefinitionIssue[] {
  const found = context.lookup(WORKFLOW_KIND, workflowId);
  if (
    found.state !== 'valid' ||
    (found.entity as WorkflowDefinition).annotations.subject === subject
  ) {
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
