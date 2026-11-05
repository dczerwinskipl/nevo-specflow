import { Type, type TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { parse, stringify } from 'yaml';

import { CATALOGUE_ID_PATTERN } from '@nevo/specflow-contracts/documents';

import type { AttentionItem } from '../attention/model';
import { ATTENTION_REASONS } from '../continuation/resolve';
import { WorkflowError } from '../errors';
import {
  ARTIFACTS_MAX,
  ARTIFACT_MAX,
  ATTEMPTS_MAX,
  ATTENTION_BYTES_MAX,
  ATTENTION_ITEMS_MAX,
  FEEDBACK_MAX,
  RECORD_BYTES_MAX,
  RETURNS_MAX,
  TASK_DEPENDENCIES_MAX,
  TASK_ID_PATTERN_SOURCE,
  TASK_SUMMARY_MAX,
  TASK_TITLE_MAX,
} from '../limits';
import { TASK_STATUSES, type SpecificationExecutionRecord, type TaskRecord } from './model';

/**
 * Text format of the stored execution state. The canonical records are YAML (they are reviewed and
 * committed with the Specification); attention items are local JSON. Every read validates the full
 * shape, so a hand-edited or truncated file fails closed instead of being interpreted, and every
 * write validates the text it produces the same way, so a record that would not read back is never
 * stored. The limits come from `../limits`, shared with the operations' input checks. A change that
 * would serialize a record or the attention list over its byte budget is refused as invalid input
 * before anything is stored; a stored file over the budget fails a read as corrupt.
 */

export const EXECUTION_STATE_VERSION = 1;

const id = () => Type.String({ pattern: CATALOGUE_ID_PATTERN });
const text = (maxLength = 4000) => Type.String({ minLength: 1, maxLength });
const sequence = () => Type.Integer({ minimum: 1 });
const timestamp = () => Type.String({ minLength: 20, maxLength: 40 });
const optional = <T extends TSchema>(schema: T) => Type.Optional(schema);
const closed = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });

const PositionSchema = Type.Union([
  closed({ state: Type.Literal('not-started') }),
  closed({ state: Type.Literal('active'), step: id(), attempt: Type.Integer({ minimum: 1 }) }),
  closed({ state: Type.Literal('ready'), step: id() }),
  closed({
    state: Type.Literal('terminal'),
    outcome: Type.Union([Type.Literal('completed'), Type.Literal('abandoned')]),
  }),
]);

const ExecutorSchema = Type.Union([
  closed({
    kind: Type.Literal('agent'),
    archetype: optional(id()),
    provider: id(),
    model: optional(text(200)),
    sessionId: optional(text(200)),
  }),
  closed({ kind: Type.Literal('human'), actorId: optional(text(200)) }),
]);

const OutcomeSchema = Type.Union([
  closed({
    kind: Type.Literal('transition'),
    transition: id(),
    result: optional(id()),
    feedback: optional(text(FEEDBACK_MAX)),
    artifacts: Type.Array(text(ARTIFACT_MAX), { maxItems: ARTIFACTS_MAX }),
  }),
  closed({ kind: Type.Literal('returned'), to: id(), feedback: optional(text(FEEDBACK_MAX)) }),
]);

const RunSchema = closed({
  workflow: closed({
    id: id(),
    version: Type.Integer({ minimum: 1 }),
    revision: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  }),
  position: PositionSchema,
  attempts: Type.Array(
    closed({
      step: id(),
      attempt: Type.Integer({ minimum: 1 }),
      sequence: sequence(),
      startedAt: timestamp(),
      executor: optional(ExecutorSchema),
      endedAt: optional(timestamp()),
      finishedBy: optional(ExecutorSchema),
      outcome: optional(OutcomeSchema),
    }),
    { maxItems: ATTEMPTS_MAX },
  ),
  returns: Type.Array(
    closed({
      sequence: sequence(),
      at: timestamp(),
      from: PositionSchema,
      to: id(),
      feedback: optional(text(FEEDBACK_MAX)),
    }),
    { maxItems: RETURNS_MAX },
  ),
});

const TaskIdSchema = Type.String({ pattern: TASK_ID_PATTERN_SOURCE });

const SpecificationFileSchema = closed({
  version: Type.Literal(EXECUTION_STATE_VERSION),
  specId: text(200),
  archetype: id(),
  taskTypes: Type.Union([
    Type.Tuple([Type.Literal('*')]),
    Type.Array(id(), { minItems: 1, maxItems: 64 }),
  ]),
  run: RunSchema,
});

const TaskFileSchema = closed({
  version: Type.Literal(EXECUTION_STATE_VERSION),
  specId: text(200),
  taskId: TaskIdSchema,
  title: text(TASK_TITLE_MAX),
  summary: optional(text(TASK_SUMMARY_MAX)),
  type: id(),
  dependsOn: Type.Array(TaskIdSchema, { maxItems: TASK_DEPENDENCIES_MAX }),
  origin: closed({ step: id(), attempt: Type.Integer({ minimum: 1 }) }),
  status: Type.Union(TASK_STATUSES.map((status) => Type.Literal(status))),
  statusChange: optional(
    closed({
      source: Type.Union([Type.Literal('decision'), Type.Literal('escalation')]),
      at: timestamp(),
      reason: optional(text(FEEDBACK_MAX)),
    }),
  ),
  run: RunSchema,
});

const SubjectSchema = Type.Union([
  closed({ kind: Type.Literal('specification'), specId: text(200) }),
  closed({ kind: Type.Literal('task'), specId: text(200), taskId: TaskIdSchema }),
]);

const AttentionFileSchema = closed({
  version: Type.Literal(EXECUTION_STATE_VERSION),
  items: Type.Array(
    closed({
      subject: SubjectSchema,
      step: id(),
      reason: Type.Union(ATTENTION_REASONS.map((reason) => Type.Literal(reason))),
      taskId: optional(TaskIdSchema),
      archetype: optional(id()),
      provider: optional(id()),
      blocker: optional(Type.Union(ATTENTION_REASONS.map((reason) => Type.Literal(reason)))),
      suggestion: optional(
        closed({
          archetype: id(),
          provider: id(),
          model: text(200),
          effort: optional(text(64)),
          session: Type.Union([
            closed({ mode: Type.Literal('fresh') }),
            closed({ mode: Type.Literal('reuse'), sessionId: text(200) }),
          ]),
        }),
      ),
      createdAt: timestamp(),
    }),
    { maxItems: ATTENTION_ITEMS_MAX },
  ),
});

function corrupt(what: string): never {
  throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The stored ${what} is not valid.`);
}

function decode(schema: TSchema, value: unknown, what: string): unknown {
  if (!Value.Check(schema, value)) {
    corrupt(what);
  }

  return value;
}

/** The byte bound of a stored file (`../limits`) on read. */
function withinBytes(source: string, max: number, what: string): void {
  if (Buffer.byteLength(source, 'utf8') > max) {
    corrupt(what);
  }
}

function parseYaml(source: string, what: string): unknown {
  withinBytes(source, RECORD_BYTES_MAX, what);
  try {
    return parse(source, { maxAliasCount: 0 }) as unknown;
  } catch {
    return corrupt(what);
  }
}

function withoutVersion<T>(value: unknown): T {
  const { version: _version, ...rest } = value as { version: number };

  return rest as T;
}

const yamlOf = (value: unknown) => stringify(value, { lineWidth: 0 });

/**
 * The text to store, checked exactly as a later read checks it; nothing invalid is ever written. A
 * text over its byte budget is a refusal of the change, not corrupt state.
 */
function checkedText(
  text: string,
  maxBytes: number,
  read: (source: string) => unknown,
  what: string,
): string {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new WorkflowError(
      'WORKFLOW_INPUT_INVALID',
      `The ${what} would exceed its stored size limit of ${String(maxBytes)} bytes.`,
    );
  }

  try {
    read(text);
  } catch (error) {
    if (error instanceof WorkflowError) {
      throw new WorkflowError('WORKFLOW_STATE_CORRUPT', `The ${what} to store is not valid.`);
    }

    throw error;
  }

  return text;
}

export function serializeSpecificationRecord(record: SpecificationExecutionRecord): string {
  return checkedText(
    yamlOf({ version: EXECUTION_STATE_VERSION, ...record }),
    RECORD_BYTES_MAX,
    parseSpecificationRecord,
    'Specification run',
  );
}

export function parseSpecificationRecord(source: string): SpecificationExecutionRecord {
  return withoutVersion(
    decode(SpecificationFileSchema, parseYaml(source, 'Specification run'), 'Specification run'),
  );
}

export function serializeTaskRecord(record: TaskRecord): string {
  return checkedText(
    yamlOf({ version: EXECUTION_STATE_VERSION, ...record }),
    RECORD_BYTES_MAX,
    parseTaskRecord,
    'Task',
  );
}

export function parseTaskRecord(source: string): TaskRecord {
  return withoutVersion(decode(TaskFileSchema, parseYaml(source, 'Task'), 'Task'));
}

export function serializeAttention(items: readonly AttentionItem[]): string {
  return checkedText(
    `${JSON.stringify({ version: EXECUTION_STATE_VERSION, items }, null, 2)}\n`,
    ATTENTION_BYTES_MAX,
    parseAttention,
    'attention list',
  );
}

export function parseAttention(source: string): AttentionItem[] {
  withinBytes(source, ATTENTION_BYTES_MAX, 'attention list');
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return corrupt('attention list');
  }

  return (decode(AttentionFileSchema, value, 'attention list') as { items: AttentionItem[] }).items;
}
