import { Type, type Static } from 'typebox';

import { NamedTaskTitlesSchema } from '../../tasks/task-list';
import { HandoffSchema, WorkflowActorSchema } from '../../workflow/projection';
import { WorkspaceAttentionSchema } from '../workspace';
import { SpecOverviewItemSchema } from './common';

export const CurrentSpecAttentionReasonSchema = Type.Union([
  Type.Literal('input'),
  Type.Literal('decision'),
  Type.Literal('review'),
  Type.Literal('blocked'),
  Type.Literal('approval'),
]);
export type CurrentSpecAttentionReason = Static<typeof CurrentSpecAttentionReasonSchema>;

export const CurrentSpecSignalKindSchema = Type.Union([
  Type.Literal('attention'),
  Type.Literal('ready'),
  Type.Literal('working'),
  Type.Literal('issue'),
  Type.Literal('quiet'),
]);
export type CurrentSpecSignalKind = Static<typeof CurrentSpecSignalKindSchema>;

export const CurrentSpecTargetSchema = Type.Union([
  Type.Object({ kind: Type.Literal('specification'), specId: Type.String() }),
  Type.Object({ kind: Type.Literal('task'), specId: Type.String(), taskId: Type.String() }),
  Type.Object({ kind: Type.Literal('session'), specId: Type.String(), sessionId: Type.String() }),
]);
export type CurrentSpecTarget = Static<typeof CurrentSpecTargetSchema>;

export const CurrentSpecSignalSchema = Type.Object({
  id: Type.String(),
  kind: CurrentSpecSignalKindSchema,
  label: Type.String(),
  reason: Type.Optional(Type.String()),
  attentionReason: Type.Optional(CurrentSpecAttentionReasonSchema),
  count: Type.Optional(Type.Integer({ minimum: 1 })),
  priority: Type.Number(),
  target: CurrentSpecTargetSchema,
});
export type CurrentSpecSignal = Static<typeof CurrentSpecSignalSchema>;

export const CurrentSpecSectionIdSchema = Type.Union([
  Type.Literal('requires-attention'),
  Type.Literal('in-progress'),
  Type.Literal('not-started'),
  Type.Literal('ended'),
  Type.Literal('unknown'),
]);
export type CurrentSpecSectionId = Static<typeof CurrentSpecSectionIdSchema>;

export const CurrentSpecClassificationSchema = Type.Union(
  [
    Type.Object({
      section: Type.Literal('requires-attention'),
      reason: Type.Optional(CurrentSpecAttentionReasonSchema),
      count: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    Type.Object({ section: Type.Literal('in-progress') }),
    Type.Object({ section: Type.Literal('not-started') }),
    Type.Object({ section: Type.Literal('ended') }),
    Type.Object({ section: Type.Literal('unknown') }),
  ],
  {
    description:
      'Single server-owned Current classification from the Specification workflow run: requires-attention (an attention item or signal) takes precedence over in-progress (the run is at a step, or a Session executes), then not-started and ended. Unknown is used when the workflow cannot be read. Reason is optional for attention.',
  },
);
const CountSchema = Type.Integer({ minimum: 0 });

/**
 * Where the Specification's workflow run stands, the same position its Overview's Now shows: not
 * started, at a step (with the step's title and its place among the workflow's declared steps), or
 * ended. A wait step carries the Task counts the Overview groups its Tasks by.
 */
export const CurrentSpecWorkflowSchema = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal('not-started'),
        /** The workflow its archetype would start: its step count and first step's title. */
        stepCount: Type.Optional(Type.Integer({ minimum: 1 })),
        firstStep: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('step'),
        state: Type.Union([Type.Literal('active'), Type.Literal('ready'), Type.Literal('waiting')]),
        /** Absent when the pinned workflow is missing or changed. */
        step: Type.Optional(
          Type.Object(
            {
              title: Type.String(),
              position: Type.Integer({ minimum: 1 }),
              count: Type.Integer({ minimum: 1 }),
            },
            { additionalProperties: false },
          ),
        ),
        /**
         * `active`: the attempt that works on the step, as the Overview's Now names it (its number,
         * since when and who started it).
         */
        attempt: Type.Optional(
          Type.Object(
            {
              number: Type.Integer({ minimum: 1 }),
              startedAt: Type.String(),
              actor: WorkflowActorSchema,
            },
            { additionalProperties: false },
          ),
        ),
        /**
         * `ready`: what the last attempt or return handed over, the Overview's Last hand-off (a
         * review that requested changes, a return), without its feedback.
         */
        handoff: Type.Optional(HandoffSchema),
        /** `waiting`: the Tasks the wait step waits for. */
        tasks: Type.Optional(
          Type.Object(
            {
              open: CountSchema,
              total: CountSchema,
              inProgress: CountSchema,
              readyToStart: CountSchema,
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('ended'),
        outcome: Type.Union([Type.Literal('completed'), Type.Literal('abandoned')]),
        /** The step count of the workflow the run followed, when it resolves. */
        stepCount: Type.Optional(Type.Integer({ minimum: 1 })),
        /** `abandoned`: when the run was abandoned. */
        abandonedAt: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
  ],
  {
    description:
      "Where the Specification's workflow run stands (the Overview's Now position): not-started, a step with its state, or ended.",
  },
);
export type CurrentSpecWorkflow = Static<typeof CurrentSpecWorkflowSchema>;
export type CurrentSpecClassification = Static<typeof CurrentSpecClassificationSchema>;

export const CurrentSpecOverviewItemSchema = Type.Object(
  {
    ...SpecOverviewItemSchema.properties,
    workflow: Type.Union([CurrentSpecWorkflowSchema, Type.Null()], {
      description: 'Null when the workflow run cannot be read.',
    }),
    classification: CurrentSpecClassificationSchema,
    attention: Type.Optional(
      Type.Object(
        {
          first: WorkspaceAttentionSchema,
          taskTitles: Type.Optional(NamedTaskTitlesSchema),
        },
        {
          additionalProperties: false,
          description:
            "The workflow's attention item the Specification's Overview lists first under Requires attention (the same record), with the titles of the Tasks it names. Present when the workflow has attention items; classification.count is how many.",
        },
      ),
    ),
    unreadable: Type.Optional(
      Type.Object(
        {
          reason: Type.Union([
            Type.Literal('invalid'),
            Type.Literal('filesystem'),
            Type.Literal('busy'),
            Type.Literal('recovery'),
            Type.Literal('unexpected'),
          ]),
        },
        {
          additionalProperties: false,
          description:
            "Why the Specification's workflow could not be read (workflow is then null): invalid (its files hold no valid state), filesystem (a file could not be read), busy (another writer held the project longer than a read waits), recovery (the project lock is held by a process nothing proves stopped, or is corrupt: only an operator's recovery helps) or unexpected.",
        },
      ),
    ),
    signals: Type.Union([Type.Array(CurrentSpecSignalSchema), Type.Null()], {
      description:
        'Bounded evidence for Current only; may be null when unavailable. Consumers must not reclassify a Specification from signals.',
    }),
    currentExecutions: Type.Union(
      [
        Type.Array(
          Type.Object({
            sessionId: Type.String(),
            agentRole: Type.String(),
            taskIds: Type.Array(Type.String()),
          }),
        ),
        Type.Null(),
      ],
      {
        description:
          'Current execution evidence only, or null when unavailable; never derived from historical Session associations.',
      },
    ),
  },
  { additionalProperties: false },
);
export type CurrentSpecOverviewItem = Static<typeof CurrentSpecOverviewItemSchema>;

export const CurrentSpecsOverviewSchema = Type.Object(
  {
    revision: Type.String(),
    collection: Type.Literal('current'),
    sections: Type.Array(CurrentSpecSectionIdSchema, {
      description:
        'Enabled Current section identifiers in server-defined display order; clients must not reorder or infer classification from raw signals.',
    }),
    items: Type.Array(CurrentSpecOverviewItemSchema, {
      description:
        'Current Specification records after per-item spec.view authorization filtering.',
    }),
  },
  { additionalProperties: false },
);
export type CurrentSpecsOverview = Static<typeof CurrentSpecsOverviewSchema>;
