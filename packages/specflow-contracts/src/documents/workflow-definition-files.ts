import { Type, type Static } from 'typebox';

import {
  DEFINITION_INSTRUCTIONS_MAX_BYTES,
  DEFINITION_SHORT_TEXT_MAX_BYTES,
  catalogueId,
  instructionsText,
  shortText,
  utf8ByteLength,
} from './definition-schema-parts';

/**
 * Definition files of deterministic execution (`.nevo/definitions/<kind>/<id>.yaml`): workflows, agent
 * archetypes and task types. They follow the same rules as the documents kinds (one file is one entity,
 * a schema per `schemaVersion`, cross-file checks belong to the Engine loader). Rules:
 * `docs/architecture/workflow/workflow-kernel.md`.
 */

const WORKFLOW_FILE_SCHEMA_VERSION = 1;

const header = <TKind extends string>(kind: TKind) => ({
  /** Lets editors bind the file to the published JSON Schema. */
  $schema: Type.Optional(Type.String()),
  kind: Type.Literal(kind),
  schemaVersion: Type.Literal(WORKFLOW_FILE_SCHEMA_VERSION),
});

const title = () => Type.String({ minLength: 1, maxLength: 200 });

/** Step, transition and result ids: the catalogue id shape, unique inside one workflow. */
const localId = () => catalogueId();

/**
 * Effects a Specification transition or return applies to the Specification's Tasks in the same
 * durable change. `approve-draft-tasks` makes every `draft` Task `ready` (typically on the pass of a
 * breakdown review). Closed today; a new effect is a new variant here and an Engine handler.
 */
export const WORKFLOW_EFFECTS = ['approve-draft-tasks'] as const;
export type WorkflowEffect = (typeof WORKFLOW_EFFECTS)[number];

const effects = () =>
  Type.Optional(
    Type.Array(Type.Union(WORKFLOW_EFFECTS.map((effect) => Type.Literal(effect))), {
      uniqueItems: true,
      maxItems: WORKFLOW_EFFECTS.length,
    }),
  );

/** The Task events a wait-step transition can be taken on (`on`). */
export const WAIT_TRIGGERS = ['tasks-finished', 'task-escalated'] as const;
export type WaitTrigger = (typeof WAIT_TRIGGERS)[number];

export const WorkflowTransitionTargetFileSchema = Type.Union([
  Type.Object({ step: localId() }, { additionalProperties: false }),
  Type.Object(
    { terminal: Type.Union([Type.Literal('completed'), Type.Literal('abandoned')]) },
    { additionalProperties: false },
  ),
]);

export const WorkflowTransitionFileSchema = Type.Object(
  {
    id: localId(),
    /**
     * The result that selects this transition. A step has either exactly one transition without a
     * result, or only transitions with distinct results; the Engine checks that.
     */
    result: Type.Optional(localId()),
    label: Type.Optional(title()),
    to: WorkflowTransitionTargetFileSchema,
    /** `auto` lets the Runtime start the next step without the owner; default `owner-action`. */
    continuation: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('owner-action')])),
    /** Whether the next step continues the finishing Session or needs a new one; default `fresh`. */
    session: Type.Optional(Type.Union([Type.Literal('fresh'), Type.Literal('reuse')])),
    /** Default `optional`. */
    feedback: Type.Optional(Type.Union([Type.Literal('required'), Type.Literal('optional')])),
    effects: effects(),
    /**
     * Task workflows only: finishing with this transition escalates to the Specification. The Task
     * goes `on-hold` with the feedback as its reason, and the Specification gets the attention item
     * `task-escalated`. Requires `feedback: required` and a step target (checked by the Engine).
     */
    escalate: Type.Optional(Type.Boolean()),
    /**
     * Wait steps only: the Task event that takes this transition. `tasks-finished` (the default for
     * a wait-step transition without `on`) when every Task is closed; `task-escalated` when a Task
     * escalated to the Specification (needs a step target and `feedback: required`, filled by the
     * Engine). A wait step has exactly one `tasks-finished` transition and at most one per trigger
     * (checked by the Engine).
     */
    on: Type.Optional(Type.Union(WAIT_TRIGGERS.map((trigger) => Type.Literal(trigger)))),
  },
  { additionalProperties: false },
);
export type WorkflowTransitionFile = Static<typeof WorkflowTransitionFileSchema>;

const stepCommon = () => ({
  id: localId(),
  title: title(),
  purpose: shortText(),
  instructions: Type.Optional(instructionsText()),
  transitions: Type.Array(WorkflowTransitionFileSchema, { minItems: 1, maxItems: 16 }),
});

/** The gate types a step may declare. Closed today; a new type is a variant here and an Engine evaluator. */
export const WORKFLOW_GATE_TYPES = ['document'] as const;
export type WorkflowGateType = (typeof WORKFLOW_GATE_TYPES)[number];

/** Where a `document` gate looks: the run's own subject (default) or the Specification. */
export const WORKFLOW_GATE_SCOPES = ['subject', 'specification'] as const;
export type WorkflowGateScope = (typeof WORKFLOW_GATE_SCOPES)[number];

/**
 * A `document` gate: satisfied when the scope (the Task or the Specification the run drives, or the
 * Specification of a Task) registers a document of `documentType` whose file exists and, when
 * `requiredSections` is given, has a Markdown heading with each of these texts (case-insensitive).
 */
const documentGateFields = () => ({
  /** Names the gate in projections and refusals; default `entry-<n>` or `exit-<n>` (from 1). */
  id: Type.Optional(localId()),
  label: Type.Optional(title()),
  type: Type.Literal('document'),
  documentType: catalogueId(),
  /** Default `subject`. */
  scope: Type.Optional(Type.Union(WORKFLOW_GATE_SCOPES.map((scope) => Type.Literal(scope)))),
  requiredSections: Type.Optional(
    /** Heading texts; each has a non-whitespace character. */
    Type.Array(Type.String({ minLength: 1, maxLength: 200, pattern: '\\S' }), {
      minItems: 1,
      maxItems: 32,
      uniqueItems: true,
    }),
  ),
});

/** Checked before the step starts (a resume is not a start). */
export const WorkflowEntryGateFileSchema = Type.Object(documentGateFields(), {
  additionalProperties: false,
});
export type WorkflowEntryGateFile = Static<typeof WorkflowEntryGateFileSchema>;

/** Checked before a finish is recorded. */
export const WorkflowExitGateFileSchema = Type.Object(
  {
    ...documentGateFields(),
    /** Only for the transitions of these results (declared on the step, checked by the Engine). */
    when: Type.Optional(Type.Array(localId(), { minItems: 1, maxItems: 16, uniqueItems: true })),
  },
  { additionalProperties: false },
);
export type WorkflowExitGateFile = Static<typeof WorkflowExitGateFileSchema>;

/** Work done by an agent (through an agent archetype), by a person, or by either. */
export const WorkflowWorkStepFileSchema = Type.Object(
  {
    ...stepCommon(),
    kind: Type.Literal('work'),
    /**
     * Who may do the step: `[agent, human]` lets the owner do an agent step by hand, `[human]` is a
     * human-only gate (for example acceptance). Each class at most once.
     */
    executors: Type.Array(Type.Union([Type.Literal('agent'), Type.Literal('human')]), {
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
    }),
    /** Preferred agent archetype; required exactly when an agent may do the step (checked by the Engine). */
    archetype: Type.Optional(catalogueId()),
    /** `interactive`: the step is a conversation with the owner (for example gathering requirements). */
    interaction: Type.Optional(
      Type.Union([Type.Literal('interactive'), Type.Literal('autonomous')]),
    ),
    /** `tasks`: finishing the step creates the Specification's Tasks from the finish input. */
    produces: Type.Optional(Type.Literal('tasks')),
    /** Must hold before the step starts; a refused start writes nothing. */
    entryGates: Type.Optional(Type.Array(WorkflowEntryGateFileSchema, { maxItems: 16 })),
    /**
     * Must hold before the step finishes with a transition they apply to (`when`); a refused finish
     * writes nothing.
     */
    exitGates: Type.Optional(Type.Array(WorkflowExitGateFileSchema, { maxItems: 16 })),
  },
  { additionalProperties: false },
);

/** A Specification step that completes on its own when every Task of the Specification is terminal. */
export const WorkflowWaitStepFileSchema = Type.Object(
  { ...stepCommon(), kind: Type.Literal('wait-for-tasks') },
  { additionalProperties: false },
);

export const WorkflowStepFileSchema = Type.Union([
  WorkflowWorkStepFileSchema,
  WorkflowWaitStepFileSchema,
]);
export type WorkflowStepFile = Static<typeof WorkflowStepFileSchema>;

/** A step the owner may return to from any non-terminal position ("back to the table"). */
export const WorkflowReturnFileSchema = Type.Object(
  {
    step: localId(),
    label: Type.Optional(title()),
    /** Default `required`: a return always says what changed. */
    feedback: Type.Optional(Type.Union([Type.Literal('required'), Type.Literal('optional')])),
    effects: effects(),
  },
  { additionalProperties: false },
);

export const WorkflowDefinitionFileSchema = Type.Object(
  {
    ...header('workflow'),
    id: catalogueId(),
    version: Type.Integer({ minimum: 1 }),
    title: title(),
    description: shortText(),
    /** What the workflow drives: a whole Specification or one Task. */
    subject: Type.Union([Type.Literal('specification'), Type.Literal('task')]),
    entryStep: localId(),
    steps: Type.Array(WorkflowStepFileSchema, { minItems: 1, maxItems: 32 }),
    returns: Type.Optional(Type.Array(WorkflowReturnFileSchema, { maxItems: 32 })),
  },
  { additionalProperties: false },
);
export type WorkflowDefinitionFile = Static<typeof WorkflowDefinitionFileSchema>;

/** A provider id (`claude`, `codex`, `antigravity`, ...): open, the Runtime decides which are available. */
const providerId = () => catalogueId();

export const AgentArchetypeProviderFileSchema = Type.Object(
  {
    provider: providerId(),
    /** Absent: the provider is known for this archetype but no model is chosen yet. */
    model: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    effort: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { additionalProperties: false },
);
export type AgentArchetypeProviderFile = Static<typeof AgentArchetypeProviderFileSchema>;

export const AgentArchetypeDefinitionFileSchema = Type.Object(
  {
    ...header('agent-archetype'),
    id: catalogueId(),
    title: title(),
    description: shortText(),
    /** The agent profile whose instructions the agent works with (for example `nevo-agents:reviewer`). */
    profile: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    instructions: Type.Optional(instructionsText()),
    /** The provider a fresh Session of this archetype starts with. */
    preferredProvider: Type.Optional(providerId()),
    providers: Type.Array(AgentArchetypeProviderFileSchema, { maxItems: 16 }),
  },
  { additionalProperties: false },
);
export type AgentArchetypeDefinitionFile = Static<typeof AgentArchetypeDefinitionFileSchema>;

export const TaskTypeDefinitionFileSchema = Type.Object(
  {
    ...header('task-type'),
    id: catalogueId(),
    title: title(),
    description: shortText(),
    useWhen: shortText(),
    instructions: Type.Optional(instructionsText()),
    /** The workflow (subject `task`) a Task of this type runs. */
    workflow: catalogueId(),
  },
  { additionalProperties: false },
);
export type TaskTypeDefinitionFile = Static<typeof TaskTypeDefinitionFileSchema>;

/** Every task type of the project. */
export const ANY_TASK_TYPE = '*';

/**
 * How a Specification of an archetype is executed: the workflow of the Specification itself and the
 * task types its Tasks may have (default: any). Each Task still has its own type and workflow.
 */
export const SpecificationExecutionSchema = Type.Object(
  {
    workflow: catalogueId(),
    taskTypes: Type.Optional(
      Type.Union([
        Type.Tuple([Type.Literal(ANY_TASK_TYPE)]),
        Type.Array(catalogueId(), { minItems: 1, maxItems: 64, uniqueItems: true }),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type SpecificationExecution = Static<typeof SpecificationExecutionSchema>;

interface TextLimitViolation {
  readonly path: string;
  readonly limitBytes: number;
  readonly actualBytes: number;
}

function collect(entries: readonly [string, string | undefined, number][]): TextLimitViolation[] {
  return entries.flatMap(([path, text, limitBytes]) => {
    if (text === undefined) {
      return [];
    }

    const actualBytes = utf8ByteLength(text);

    return actualBytes > limitBytes ? [{ path, limitBytes, actualBytes }] : [];
  });
}

/** Exact UTF-8 byte check of a workflow file that passed {@link WorkflowDefinitionFileSchema}. */
export function findWorkflowFileLimitViolations(
  file: WorkflowDefinitionFile,
): TextLimitViolation[] {
  return collect([
    ['/description', file.description, DEFINITION_SHORT_TEXT_MAX_BYTES],
    ...file.steps.flatMap((step, index): [string, string | undefined, number][] => [
      [`/steps/${index}/purpose`, step.purpose, DEFINITION_SHORT_TEXT_MAX_BYTES],
      [`/steps/${index}/instructions`, step.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES],
    ]),
  ]);
}

export function findAgentArchetypeFileLimitViolations(
  file: AgentArchetypeDefinitionFile,
): TextLimitViolation[] {
  return collect([
    ['/description', file.description, DEFINITION_SHORT_TEXT_MAX_BYTES],
    ['/instructions', file.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES],
  ]);
}

export function findTaskTypeFileLimitViolations(
  file: TaskTypeDefinitionFile,
): TextLimitViolation[] {
  return collect([
    ['/description', file.description, DEFINITION_SHORT_TEXT_MAX_BYTES],
    ['/useWhen', file.useWhen, DEFINITION_SHORT_TEXT_MAX_BYTES],
    ['/instructions', file.instructions, DEFINITION_INSTRUCTIONS_MAX_BYTES],
  ]);
}
