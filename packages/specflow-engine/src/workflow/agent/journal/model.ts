import { Type } from 'typebox';
import { Value } from 'typebox/value';

import type { JournalKind } from '../../../specs/durable';
import { WorkflowError } from '../../errors';
import { assertFinishInputShape } from '../../input-schema';
import { RECORD_BYTES_MAX } from '../../limits';
import type { FinishStepInput } from '../../operations/finish';
import { ActorSchema } from '../../state/codec';
import type { AgentActor, WorkflowSubject } from '../../state/model';

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
/** A proposal holds one finish input, whose records fit the stored run record's budget. */
const AGENT_ATTEMPT_JOURNAL_MAX_BYTES = 2 * RECORD_BYTES_MAX;

/**
 * The trusted binding of one Turn of the attempt, recorded before it is dispatched: the Runtime
 * invocation (the execution claim's `operationId`) and the Session Turn. The last one is the
 * attempt's current Turn; a call bound to an earlier one is a late callback and is refused.
 */
export interface AgentTurnBinding {
  readonly invocationId: string;
  readonly turnId: string;
  readonly boundAt: string;
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
  /** The transition the input takes, as validated at submission. */
  readonly transition: string;
  readonly submittedAt: string;
  readonly state: AgentProposalState;
  /** Why the finalize re-validation refused it (`state: refused` only). */
  readonly refusal?: { readonly code: string; readonly message: string };
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
}

const closed = { additionalProperties: false } as const;
const uuid = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const timestamp = Type.String({ minLength: 20, maxLength: 40 });

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
      Type.Object({ invocationId: uuid, turnId: text(200), boundAt: timestamp }, closed),
      { minItems: 1, maxItems: AGENT_ATTEMPT_TURNS_MAX },
    ),
    proposal: Type.Optional(
      Type.Object(
        {
          requestDigest: Type.String({ pattern: '^[0-9a-f]{64}$' }),
          invocationId: uuid,
          actor: ActorSchema,
          input: Type.Unknown(),
          transition: text(200),
          submittedAt: timestamp,
          state: Type.Union([
            Type.Literal('pending'),
            Type.Literal('refused'),
            Type.Literal('finalized'),
          ]),
          refusal: Type.Optional(Type.Object({ code: text(100), message: text(4000) }, closed)),
        },
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
  if (
    journal.operationId !== operationId ||
    journal.actor.class !== 'agent' ||
    (proposal !== undefined &&
      (proposal.actor.class !== 'agent' ||
        (proposal.state === 'refused') !== (proposal.refusal !== undefined) ||
        !journal.turns.some((turn) => turn.invocationId === proposal.invocationId) ||
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
  isSettled: (journal) => journal.proposal?.state === 'finalized',
  errors: {
    invalid: invalidAgentAttemptJournal,
    unsupported: invalidAgentAttemptJournal,
    invalidOperationId: () =>
      new WorkflowError('WORKFLOW_INPUT_INVALID', 'An agent attempt id is a UUID.'),
    payloadUnprovable: (message) => new WorkflowError('WORKFLOW_STATE_CORRUPT', message),
  },
};

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
