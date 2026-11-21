import { createHash } from 'node:crypto';

import { Type } from 'typebox';
import { Value } from 'typebox/value';

import { ERROR_DETAIL_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import type { JournalKind } from '../../../specs/durable';
import { WorkflowError } from '../../errors';
import { assertFinishInputShape } from '../../input-schema';
import { RECORD_BYTES_MAX } from '../../limits';
import type { FinishStepInput } from '../../operations/finish';
import { ActorSchema } from '../../state/codec';
import type { AgentActor, OwnerActor, WorkflowSubject } from '../../state/model';

/**
 * The local journal of one agent attempt started for Ask agent, keyed by the attempt's `attemptId`
 * (its binding on the attempt record, `AgentAttemptBinding`). It holds what is never committed: the
 * binding of each Turn of the attempt and the agent's finish proposal. It lives under the Project's
 * local state, so a refused proposal is never part of the Specification's history.
 */

export const AGENT_ATTEMPT_JOURNAL_VERSION = 1;
export const AGENT_ATTEMPT_RELATIVE_DIR = 'engine/operations/agent-attempt';
/** One attempt takes at most this many Turns (each Continue is one). */
export const AGENT_ATTEMPT_TURNS_MAX = 100;
/** A Turn's dirty set names at most this many paths; more are cut (`truncated`). */
export const AGENT_DIRTY_PATHS_MAX = 500;
/** A dirty file larger than this is named but not hashed (`oversize`). */
export const AGENT_DIRTY_FILE_BYTES_MAX = 64 * 1024 * 1024;
/** A dirty path longer than this is not named; the set is `truncated`. */
export const AGENT_DIRTY_PATH_LENGTH_MAX = 1024;
/**
 * A proposal holds one finish input, whose records fit the stored run record's budget, and the last
 * Turn's dirty set at most {@link AGENT_DIRTY_PATHS_MAX} paths.
 */
const AGENT_ATTEMPT_JOURNAL_MAX_BYTES = 4 * RECORD_BYTES_MAX;

/**
 * The trusted binding of one Turn of the attempt, recorded before it is dispatched: the Runtime
 * invocation (the execution claim's `operationId`) and the Session Turn. The last one is the
 * attempt's current Turn; a call bound to an earlier one is a late callback and is refused.
 */
export interface AgentTurnBinding {
  readonly invocationId: string;
  readonly turnId: string;
  readonly boundAt: string;
  /**
   * When the attempt's finalize section ran for this Turn (it records the Turn's outcome and dirty
   * set and, in the same section, settles the Turn's execution claim).
   */
  readonly finalizedAt?: string;
}

/**
 * One path of a dirty set: its content hash (sha256 hex), `null` when it is not a regular file or
 * is larger than {@link AGENT_DIRTY_FILE_BYTES_MAX} (`oversize`, not hashed).
 */
export interface AgentDirtyPath {
  readonly path: string;
  readonly sha256: string | null;
  readonly oversize?: true;
}

/**
 * What was uncommitted in the attempt's checkout when a Turn's claim settled (every staged, modified,
 * removed or untracked path), recorded as data in the finalize section so the next Turn's dispatch
 * can tell what changed between Turns. Only the last settled Turn's set is kept.
 */
export interface AgentDirtySet {
  readonly invocationId: string;
  readonly recordedAt: string;
  /** Sorted by path. */
  readonly paths: readonly AgentDirtyPath[];
  /** More paths were dirty than the set names (see {@link AGENT_DIRTY_PATHS_MAX}). */
  readonly truncated?: true;
}

/**
 * The paths an attribution refusal names (`boundary/attribution.ts`; the contracts'
 * `WorkflowAttribution`): the first `ERROR_DETAIL_PATHS_MAX` of them, sorted, of `count`.
 */
export interface AttributionDetails {
  readonly paths: readonly string[];
  readonly count: number;
  readonly undeclared?: readonly string[];
  readonly unchanged?: readonly string[];
  readonly remedies?: readonly ('classify' | 'delete' | 'restore')[];
  readonly incomplete?: true;
}

export interface AgentRefusal {
  readonly code: string;
  readonly message: string;
  /** The paths an attribution refusal named (`AttributionRefusalError`), for the owner's view. */
  readonly attribution?: AttributionDetails;
}

/**
 * The owner's return of the step while the attempt's Turn may still run (D19): recorded while the
 * agent's claim is held, applied as the attempt's `returned` outcome only in the finalize section,
 * once the Turn is proven stopped. `refused`: the finalize re-validation refused it (`refusal`); the
 * attempt stays active.
 */
export interface AgentReturnRequest {
  readonly step: string;
  readonly feedback?: string;
  readonly actor: OwnerActor;
  readonly requestedAt: string;
  readonly state: 'requested' | 'applied' | 'refused';
  readonly refusal?: AgentRefusal;
}

/**
 * The post actions of a finalized attempt, run after the finalize section released the control
 * lock. `attempt-commit` is the attempt's one Engine-owned commit (D15); it takes the place of the
 * workflow finish post action (`commit-execution-state`) for an agent attempt.
 */
export type AgentPostActionKind = 'attempt-commit';

/**
 * A changed file the agent declared (`changes.paths`), with its content hash (sha256 hex) when the
 * step state was published: `null` for a file the attempt removed. The attempt commit takes it only
 * while its content still is this. `oversize`: too large to hash; it is never committed.
 */
export interface AgentDeclaredPath {
  readonly path: string;
  readonly sha256: string | null;
  readonly oversize?: true;
}

/** What one of the host's post actions reported (`PostActionResult`, without its message). */
export interface AgentPostActionOutcome {
  readonly action: string;
  readonly status: 'completed' | 'skipped' | 'failed';
  readonly code?: string;
}

/**
 * One post action of the attempt, recorded `pending` in the finalize section before the claim
 * settles, so a crash after the section resumes it rather than losing it. Its `operationId` derives
 * from `(attemptId, kind)` ({@link agentPostActionId}): a retry or a restart runs the same operation.
 */
export interface AgentPostActionRecord {
  readonly kind: AgentPostActionKind;
  readonly operationId: string;
  /** The finished step's title, which the post action words its work with. */
  readonly stepTitle: string;
  /**
   * `pending`: not run yet (or interrupted); `done`: it ran and nothing failed; `failed`: it ran and
   * reported a failure, kept for a retry (`retryAgentPostActions`).
   */
  readonly state: 'pending' | 'done' | 'failed';
  /** What its last run did (`done` and `failed` only). */
  readonly outcomes?: readonly AgentPostActionOutcome[];
  /** When its last run was recorded (`done` and `failed` only; absent in an older journal). */
  readonly ranAt?: string;
  /**
   * How many runs of it were recorded (absent: none). A run that is not recorded yet (a crash
   * before its record) is repeated with the same operation; a retry after a recorded failure is a
   * new one ({@link agentPostActionRunId}).
   */
  readonly runs?: number;
  /** `attempt-commit`: the declared paths with the hashes recorded when the step was published. */
  readonly declared?: readonly AgentDeclaredPath[];
}

/**
 * - `pending`: validated at submission, waiting for the Turn to end and be finalized;
 * - `refused`: the finalize re-validation refused it (`refusal`); the attempt stays active and a new
 *   proposal may replace it;
 * - `finalized`: published in the execution store; it never changes again.
 */
export type AgentProposalState = 'pending' | 'refused' | 'finalized';

/**
 * The agent's finish proposal: the same finish input a person submits, validated with the owner's
 * finish rules when it was submitted. `requestDigest` is the finish digest (`finishDigest` of
 * step, attempt and input), the one the published attempt records, so publishing it again is a replay.
 */
export interface AgentFinishProposal {
  readonly requestDigest: string;
  /** The Turn that submitted it. */
  readonly invocationId: string;
  /** The trusted actor of that Turn; the finalized finish is recorded with exactly this actor. */
  readonly actor: AgentActor;
  readonly input: FinishStepInput['input'];
  /**
   * The files outside the Engine's folders the attempt changed, as the agent declared them (sorted;
   * absent when none). Part of what makes two proposals the same.
   */
  readonly changes?: { readonly paths: readonly string[] };
  /** The transition the input takes, as validated at submission. */
  readonly transition: string;
  readonly submittedAt: string;
  readonly state: AgentProposalState;
  /** Why the finalize re-validation refused it (`state: refused` only). */
  readonly refusal?: AgentRefusal;
}

/**
 * The owner took the attempt over (F17, D19) once its last Turn's claim was settled: the attempt
 * ended `taken-over` and the owner's own attempt `attempt` of the step started. Nothing the agent
 * wrote is undone or committed by it.
 */
export interface AgentTakeOver {
  readonly actor: OwnerActor;
  readonly at: string;
  /** The owner's attempt that took it over. */
  readonly attempt: number;
}

export interface AgentAttemptJournal {
  readonly version: typeof AGENT_ATTEMPT_JOURNAL_VERSION;
  /** The attempt's `attemptId`. */
  readonly operationId: string;
  readonly subject: WorkflowSubject;
  readonly step: string;
  readonly attempt: number;
  /** The actor the attempt was started with. */
  readonly actor: AgentActor;
  readonly workspaceId: string;
  /** In binding order; never empty. */
  readonly turns: readonly AgentTurnBinding[];
  readonly proposal?: AgentFinishProposal;
  /** Recorded only by the owner's return during the attempt; applied by the finalize section. */
  readonly returnRequest?: AgentReturnRequest;
  /** The dirty set of the last Turn whose claim settled. */
  readonly dirtySet?: AgentDirtySet;
  /** Only once the attempt was finalized (its proposal `finalized`). */
  readonly postActions?: readonly AgentPostActionRecord[];
  /** Only once the owner took the attempt over. */
  readonly takeOver?: AgentTakeOver;
}

/**
 * The attempt ended: its proposal was published, the owner's return was applied, or the owner took
 * it over.
 */
export function isAttemptResolved(journal: AgentAttemptJournal): boolean {
  return (
    journal.proposal?.state === 'finalized' ||
    journal.returnRequest?.state === 'applied' ||
    journal.takeOver !== undefined
  );
}

/** Ended, and nothing of it is left to run: its journal can move to `settled/`. */
export function isAttemptJournalSettled(journal: AgentAttemptJournal): boolean {
  return (
    isAttemptResolved(journal) &&
    (journal.postActions ?? []).every((action) => action.state === 'done')
  );
}

const closed = { additionalProperties: false } as const;
const uuid = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const timestamp = Type.String({ minLength: 20, maxLength: 40 });
const sha256 = Type.String({ pattern: '^[0-9a-f]{64}$' });
const pathList = Type.Array(text(AGENT_DIRTY_PATH_LENGTH_MAX), {
  maxItems: ERROR_DETAIL_PATHS_MAX,
});
const refusal = Type.Object(
  {
    code: text(100),
    message: text(4000),
    attribution: Type.Optional(
      Type.Object(
        {
          paths: pathList,
          count: Type.Integer({ minimum: 0 }),
          undeclared: Type.Optional(pathList),
          unchanged: Type.Optional(pathList),
          remedies: Type.Optional(
            Type.Array(
              Type.Union([
                Type.Literal('classify'),
                Type.Literal('delete'),
                Type.Literal('restore'),
              ]),
              {
                maxItems: 3,
              },
            ),
          ),
          incomplete: Type.Optional(Type.Literal(true)),
        },
        closed,
      ),
    ),
  },
  closed,
);

const JournalSchema = Type.Object(
  {
    version: Type.Literal(AGENT_ATTEMPT_JOURNAL_VERSION),
    operationId: uuid,
    subject: Type.Union([
      Type.Object({ kind: Type.Literal('specification'), specId: text(200) }, closed),
      Type.Object({ kind: Type.Literal('task'), specId: text(200), taskId: text(200) }, closed),
    ]),
    step: text(200),
    attempt: Type.Integer({ minimum: 1 }),
    actor: ActorSchema,
    workspaceId: uuid,
    turns: Type.Array(
      Type.Object(
        {
          invocationId: uuid,
          turnId: text(200),
          boundAt: timestamp,
          finalizedAt: Type.Optional(timestamp),
        },
        closed,
      ),
      { minItems: 1, maxItems: AGENT_ATTEMPT_TURNS_MAX },
    ),
    proposal: Type.Optional(
      Type.Object(
        {
          requestDigest: Type.String({ pattern: '^[0-9a-f]{64}$' }),
          invocationId: uuid,
          actor: ActorSchema,
          input: Type.Unknown(),
          changes: Type.Optional(
            Type.Object(
              {
                paths: Type.Array(text(AGENT_DIRTY_PATH_LENGTH_MAX), {
                  minItems: 1,
                  maxItems: AGENT_DIRTY_PATHS_MAX,
                }),
              },
              closed,
            ),
          ),
          transition: text(200),
          submittedAt: timestamp,
          state: Type.Union([
            Type.Literal('pending'),
            Type.Literal('refused'),
            Type.Literal('finalized'),
          ]),
          refusal: Type.Optional(refusal),
        },
        closed,
      ),
    ),
    returnRequest: Type.Optional(
      Type.Object(
        {
          step: text(200),
          feedback: Type.Optional(text(32768)),
          actor: ActorSchema,
          requestedAt: timestamp,
          state: Type.Union([
            Type.Literal('requested'),
            Type.Literal('applied'),
            Type.Literal('refused'),
          ]),
          refusal: Type.Optional(refusal),
        },
        closed,
      ),
    ),
    dirtySet: Type.Optional(
      Type.Object(
        {
          invocationId: uuid,
          recordedAt: timestamp,
          paths: Type.Array(
            Type.Object(
              {
                path: text(AGENT_DIRTY_PATH_LENGTH_MAX),
                sha256: Type.Union([sha256, Type.Null()]),
                oversize: Type.Optional(Type.Literal(true)),
              },
              closed,
            ),
            { maxItems: AGENT_DIRTY_PATHS_MAX },
          ),
          truncated: Type.Optional(Type.Literal(true)),
        },
        closed,
      ),
    ),
    postActions: Type.Optional(
      Type.Array(
        Type.Object(
          {
            kind: Type.Literal('attempt-commit'),
            operationId: uuid,
            stepTitle: text(1000),
            runs: Type.Optional(Type.Integer({ minimum: 1 })),
            ranAt: Type.Optional(timestamp),
            declared: Type.Optional(
              Type.Array(
                Type.Object(
                  {
                    path: text(AGENT_DIRTY_PATH_LENGTH_MAX),
                    sha256: Type.Union([sha256, Type.Null()]),
                    oversize: Type.Optional(Type.Literal(true)),
                  },
                  closed,
                ),
                { maxItems: AGENT_DIRTY_PATHS_MAX },
              ),
            ),
            state: Type.Union([
              Type.Literal('pending'),
              Type.Literal('done'),
              Type.Literal('failed'),
            ]),
            outcomes: Type.Optional(
              Type.Array(
                Type.Object(
                  {
                    action: text(100),
                    status: Type.Union([
                      Type.Literal('completed'),
                      Type.Literal('skipped'),
                      Type.Literal('failed'),
                    ]),
                    code: Type.Optional(text(100)),
                  },
                  closed,
                ),
                { maxItems: 20 },
              ),
            ),
          },
          closed,
        ),
        { minItems: 1, maxItems: 10 },
      ),
    ),
    takeOver: Type.Optional(
      Type.Object(
        { actor: ActorSchema, at: timestamp, attempt: Type.Integer({ minimum: 2 }) },
        closed,
      ),
    ),
  },
  closed,
);

export function invalidAgentAttemptJournal(): WorkflowError {
  return new WorkflowError(
    'WORKFLOW_STATE_CORRUPT',
    'The local journal of the agent attempt is not valid.',
  );
}

function hasFinishInputShape(input: unknown): boolean {
  try {
    assertFinishInputShape(input);

    return true;
  } catch {
    return false;
  }
}

/** Validates a journal read from or written to disk; anything else fails closed. */
export function parseAgentAttemptJournal(value: unknown, operationId: string): AgentAttemptJournal {
  if (!Value.Check(JournalSchema, value)) {
    throw invalidAgentAttemptJournal();
  }

  const journal = value as AgentAttemptJournal;
  const proposal = journal.proposal;
  const returnRequest = journal.returnRequest;
  const bound = (invocationId: string) =>
    journal.turns.some((turn) => turn.invocationId === invocationId);
  if (
    (returnRequest !== undefined &&
      (returnRequest.actor.class !== 'human' ||
        (returnRequest.state === 'refused') !== (returnRequest.refusal !== undefined))) ||
    (journal.dirtySet !== undefined && !bound(journal.dirtySet.invocationId)) ||
    (journal.takeOver !== undefined &&
      (journal.takeOver.actor.class !== 'human' ||
        journal.takeOver.attempt <= journal.attempt ||
        journal.proposal?.state === 'finalized' ||
        journal.proposal?.state === 'pending' ||
        journal.returnRequest?.state === 'applied' ||
        journal.returnRequest?.state === 'requested')) ||
    (journal.postActions !== undefined &&
      (proposal?.state !== 'finalized' ||
        journal.postActions.some(
          (action) =>
            action.operationId !== agentPostActionId(journal.operationId, action.kind) ||
            (action.state !== 'pending') !== (action.outcomes !== undefined) ||
            (action.state !== 'pending') !== (action.runs !== undefined),
        )))
  ) {
    throw invalidAgentAttemptJournal();
  }

  if (
    journal.operationId !== operationId ||
    journal.actor.class !== 'agent' ||
    (proposal !== undefined &&
      (proposal.actor.class !== 'agent' ||
        (proposal.state === 'refused') !== (proposal.refusal !== undefined) ||
        !bound(proposal.invocationId) ||
        !hasFinishInputShape(proposal.input)))
  ) {
    throw invalidAgentAttemptJournal();
  }

  return journal;
}

export const AGENT_ATTEMPT_JOURNAL_KIND: JournalKind<AgentAttemptJournal> = {
  name: 'agent-attempt',
  label: 'Agent attempt',
  relativeDir: AGENT_ATTEMPT_RELATIVE_DIR,
  version: AGENT_ATTEMPT_JOURNAL_VERSION,
  maxBytes: AGENT_ATTEMPT_JOURNAL_MAX_BYTES,
  listingMaxFiles: 1000,
  parse: (_context, value, operationId) => parseAgentAttemptJournal(value, operationId),
  isSettled: isAttemptJournalSettled,
  errors: {
    invalid: invalidAgentAttemptJournal,
    unsupported: invalidAgentAttemptJournal,
    invalidOperationId: () =>
      new WorkflowError('WORKFLOW_INPUT_INVALID', 'An agent attempt id is a UUID.'),
    payloadUnprovable: (message) => new WorkflowError('WORKFLOW_STATE_CORRUPT', message),
  },
};

/**
 * The operation id of one post action of the attempt, derived from `(attemptId, kind)`: a UUID
 * (version 8) of their sha256, so every retry and restart names the same operation.
 */
export function agentPostActionId(attemptId: string, kind: AgentPostActionKind): string {
  return uuidOf(`agent-post-action:${attemptId}:${kind}`);
}

/** A UUID (version 8) of the sha256 of `seed`. */
function uuidOf(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '8' + hex.slice(13, 16),
    variant + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * The operation id of one run of a post action: the action's own id for its first run (and for a
 * run repeated after a crash before its record), a derived one for each retry after a recorded run,
 * so a retry is a new operation (its predecessor ended) and a restart is not.
 */
export function agentPostActionRunId(action: AgentPostActionRecord): string {
  return action.runs === undefined
    ? action.operationId
    : uuidOf(`agent-post-action-run:${action.operationId}:${String(action.runs)}`);
}

/** Whether the journal is the one of the attempt `step#attempt` of `subject`. */
export function sameAttempt(
  journal: AgentAttemptJournal,
  subject: WorkflowSubject,
  step: string,
  attempt: number,
): boolean {
  return (
    journal.step === step &&
    journal.attempt === attempt &&
    journal.subject.kind === subject.kind &&
    journal.subject.specId === subject.specId &&
    (journal.subject.kind !== 'task' ||
      (subject.kind === 'task' && journal.subject.taskId === subject.taskId))
  );
}
