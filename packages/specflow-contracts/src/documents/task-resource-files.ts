import { Type, type Static, type TSchema } from 'typebox';

import { DOCUMENT_PATH_MAX_LENGTH, JSON_SCHEMA_DRAFT_2020_12 } from './definition';
import { CATALOGUE_ID_PATTERN, DOCUMENT_ID_PATTERN } from './vocabulary';

/**
 * The files of a Task resource inside a Specification (draft F20, `ideas.specflow-engine.task-resource-and-context`):
 *
 * - `<specification>/tasks/index.yaml`: the only authority for which Tasks exist and in which order;
 *   an entry is only `{id}`;
 * - `<specification>/tasks/<id>/task.yaml`: the Task manifest (title, summary, immutable type,
 *   preparation status, dependencies, origin, document registry with the required `task` document
 *   `task.md`, typed context list).
 *
 * The schemas check the shape and the bounds of one file. Cross-file rules (index entry ↔ folder ↔
 * manifest id, dependencies on registered Tasks without cycles, context references that exist) belong
 * to the Engine (`packages/specflow-engine/src/tasks/resource`). The bounds below are the single
 * source; the Engine re-exports them next to its workflow limits.
 */

export const TASK_RESOURCE_SCHEMA_VERSION = 1;

/**
 * A Task id: lowercase letters, digits and dashes, at most 64 characters. It names the Task folder and
 * the Task run record, so Windows device names are excluded.
 */
export const TASK_ID_PATTERN =
  '^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$)[a-z0-9][a-z0-9-]{0,63}$';
export const TASK_TITLE_MAX_LENGTH = 200;
/** One line for lists and cards; the full description is `task.md`. */
export const TASK_SUMMARY_MAX_LENGTH = 4000;
/** The reason of a status decision, or the feedback of the Task's escalation. */
export const TASK_STATUS_REASON_MAX_LENGTH = 16_384;
export const TASK_DEPENDENCIES_MAX = 100;
/** Tasks of one Specification over all breakdowns and manual creations. */
export const TASKS_PER_SPECIFICATION_MAX = 200;
export const TASK_DOCUMENTS_MAX = 50;
export const TASK_CONTEXT_ENTRIES_MAX = 50;
export const TASK_CONTEXT_NOTE_MAX_LENGTH = 500;
export const TASK_CONTEXT_INSTRUCTIONS_MAX_LENGTH = 8000;
export const TASK_ACTOR_ID_MAX_LENGTH = 200;
/** A project (repository) document by its stable id, as `pnpm docs:get <id>` takes it. */
export const PROJECT_DOCUMENT_ID_PATTERN = '^[a-z0-9][a-z0-9._-]{0,199}$';

/** The required main document of every Task. */
export const TASK_MAIN_DOCUMENT = { id: 'task', path: 'task.md', type: 'task' } as const;

export const TASK_STATUSES = ['draft', 'ready', 'on-hold', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_CONTEXT_KINDS = [
  'task-document',
  'specification-document',
  'project-document',
  'path',
  'instructions',
] as const;
export type TaskContextKind = (typeof TASK_CONTEXT_KINDS)[number];

const closed = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const taskId = () => Type.String({ pattern: TASK_ID_PATTERN });
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const timestamp = () => Type.String({ minLength: 20, maxLength: 40 });
const fileHeader = () => ({
  /** Lets editors bind the file to the published JSON Schema. */
  $schema: Type.Optional(Type.String()),
  schemaVersion: Type.Literal(TASK_RESOURCE_SCHEMA_VERSION),
});

export const TaskIndexFileSchema = closed({
  ...fileHeader(),
  /** Membership and order: the planner's presentation and suggested execution order. */
  tasks: Type.Array(closed({ id: taskId() }), { maxItems: TASKS_PER_SPECIFICATION_MAX }),
});
export type TaskIndexFile = Static<typeof TaskIndexFileSchema>;

export const TaskOriginSchema = Type.Union([
  /** Created by a person (the owner) through the Runtime or the CLI. */
  closed({ kind: Type.Literal('manual'), actorId: text(TASK_ACTOR_ID_MAX_LENGTH) }),
  /** Drafted by the finish of a Specification step that produces Tasks. */
  closed({
    kind: Type.Literal('produced'),
    step: Type.String({ pattern: CATALOGUE_ID_PATTERN }),
    attempt: Type.Integer({ minimum: 1 }),
  }),
]);
export type TaskOrigin = Static<typeof TaskOriginSchema>;

export const TaskStatusChangeSchema = closed({
  /** `abandon`: cancelled because the owner abandoned the Specification. */
  source: Type.Union([
    Type.Literal('decision'),
    Type.Literal('escalation'),
    Type.Literal('abandon'),
  ]),
  at: timestamp(),
  reason: Type.Optional(text(TASK_STATUS_REASON_MAX_LENGTH)),
});
export type TaskStatusChange = Static<typeof TaskStatusChangeSchema>;

/** One registered document of the Task: path relative to the Task folder. */
export const TaskDocumentEntrySchema = closed({
  id: Type.String({ pattern: DOCUMENT_ID_PATTERN }),
  path: text(DOCUMENT_PATH_MAX_LENGTH),
  type: Type.String({ pattern: CATALOGUE_ID_PATTERN }),
});
export type TaskDocumentEntry = Static<typeof TaskDocumentEntrySchema>;

const contextCommon = () => ({
  /** A missing required entry refuses the start of a step; a missing optional one is skipped. */
  required: Type.Boolean(),
  /** Why the entry is there. */
  note: Type.Optional(text(TASK_CONTEXT_NOTE_MAX_LENGTH)),
});

/**
 * A reference that may name something not there yet: a process artifact another step or Task
 * produces. While it is missing the entry is `awaited` (expected, not stale), never refused on create
 * or edit; a required one still blocks the start of a step until it exists. `instructions` have none.
 */
const referenceCommon = () => ({
  ...contextCommon(),
  artifact: Type.Optional(Type.Boolean()),
});

/** One entry of the typed, ordered context list of a Task. */
export const TaskContextEntrySchema = Type.Union([
  closed({
    kind: Type.Literal('task-document'),
    id: Type.String({ pattern: DOCUMENT_ID_PATTERN }),
    ...referenceCommon(),
  }),
  closed({
    kind: Type.Literal('specification-document'),
    id: Type.String({ pattern: DOCUMENT_ID_PATTERN }),
    ...referenceCommon(),
  }),
  closed({
    kind: Type.Literal('project-document'),
    id: Type.String({ pattern: PROJECT_DOCUMENT_ID_PATTERN }),
    ...referenceCommon(),
  }),
  /** A file, folder or glob relative to the repository root. */
  closed({
    kind: Type.Literal('path'),
    path: text(DOCUMENT_PATH_MAX_LENGTH),
    ...referenceCommon(),
  }),
  closed({
    kind: Type.Literal('instructions'),
    text: text(TASK_CONTEXT_INSTRUCTIONS_MAX_LENGTH),
    ...contextCommon(),
  }),
]);
export type TaskContextEntry = Static<typeof TaskContextEntrySchema>;

export const TaskManifestFileSchema = closed({
  ...fileHeader(),
  /** Equals the Task folder name. */
  id: taskId(),
  title: text(TASK_TITLE_MAX_LENGTH),
  summary: Type.Optional(text(TASK_SUMMARY_MAX_LENGTH)),
  /** The task type id; immutable after creation. */
  type: Type.String({ pattern: CATALOGUE_ID_PATTERN }),
  status: Type.Union([
    Type.Literal('draft'),
    Type.Literal('ready'),
    Type.Literal('on-hold'),
    Type.Literal('cancelled'),
  ]),
  statusChange: Type.Optional(TaskStatusChangeSchema),
  dependsOn: Type.Array(taskId(), { maxItems: TASK_DEPENDENCIES_MAX, uniqueItems: true }),
  origin: TaskOriginSchema,
  /** The registry of the Task's documents; the `task` document (`task.md`) is required. */
  documents: Type.Array(TaskDocumentEntrySchema, { minItems: 1, maxItems: TASK_DOCUMENTS_MAX }),
  /** Absent: the default context (`task.md`, the Task's documents, the Specification overview). */
  context: Type.Optional(
    Type.Array(TaskContextEntrySchema, { maxItems: TASK_CONTEXT_ENTRIES_MAX }),
  ),
});
export type TaskManifestFile = Static<typeof TaskManifestFileSchema>;

export const TASK_RESOURCE_FILES = ['task-index', 'task-manifest'] as const;
export type TaskResourceFile = (typeof TASK_RESOURCE_FILES)[number];

const TASK_RESOURCE_FILE_SCHEMAS = {
  'task-index': {
    title: 'Nevo SpecFlow Task index',
    description:
      'tasks/index.yaml of a Specification: which Tasks exist and in which order (schemaVersion 1).',
    schema: TaskIndexFileSchema,
  },
  'task-manifest': {
    title: 'Nevo SpecFlow Task manifest',
    description: 'tasks/<id>/task.yaml of a Specification: one Task resource (schemaVersion 1).',
    schema: TaskManifestFileSchema,
  },
} as const satisfies Record<TaskResourceFile, unknown>;

/** `$id` of the published JSON Schema of one Task resource file. */
export function taskResourceSchemaId(file: TaskResourceFile): string {
  return `urn:nevo:specflow:task-resource:${file}:${TASK_RESOURCE_SCHEMA_VERSION}`;
}

/** Committed file name below `schema/task-resource/`, for example `task-index.v1.schema.json`. */
export function taskResourceJsonSchemaFileName(file: TaskResourceFile): string {
  return `${file}.v${TASK_RESOURCE_SCHEMA_VERSION}.schema.json`;
}

/** The published JSON Schema (draft 2020-12) of one Task resource file, derived from the TypeBox type. */
export function createTaskResourceJsonSchema(file: TaskResourceFile): Record<string, unknown> {
  const entry = TASK_RESOURCE_FILE_SCHEMAS[file];

  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: taskResourceSchemaId(file),
    title: entry.title,
    description: entry.description,
    ...(JSON.parse(JSON.stringify(entry.schema)) as Record<string, unknown>),
  };
}

export function serializeTaskResourceJsonSchema(file: TaskResourceFile): string {
  return `${JSON.stringify(createTaskResourceJsonSchema(file), null, 2)}\n`;
}
