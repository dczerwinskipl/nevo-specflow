import type { AttemptRecord } from '@nevo/workflow';

import type { LedgerEntry } from '../../../specs/durable/ledger/model';
import type { TaskManifest } from '../../../tasks/resource/model';
import { agentAttemptBindingOf, type WorkflowActor, type WorkflowSubject } from '../../state/model';
import {
  attemptInvocations,
  selectAttemptLedgerEntries,
} from '../finalize/attempt-commit/selection';
import type { AgentAttemptWork } from '../../operations/actions';
import type { AgentAttemptJournal } from '../journal/model';

export type { AgentAttemptWork };

export const AGENT_ATTEMPT_EVENT_KINDS = [
  'started',
  'turn-started',
  'turn-ended',
  'proposal-refused',
  'return-requested',
  'returned',
  'finished',
  'committed',
  'commit-failed',
  'taken-over',
  'abandoned',
] as const;

/**
 * One step event of an agent attempt, oldest first. `turn` numbers the Turn (1-based) of a Turn
 * event; `code` names a refusal or a commit failure; `runs` how often the commit ran. `at` is absent
 * only for an event recorded without a time (a commit run of an older journal).
 */
export interface AgentAttemptEvent {
  readonly kind: (typeof AGENT_ATTEMPT_EVENT_KINDS)[number];
  readonly at?: string;
  readonly turn?: number;
  readonly code?: string;
  readonly runs?: number;
}

/**
 * The agent detail of one attempt of a run for its history (Task and Workflow history): who worked
 * on it, how it ended, its step events and the work it left. `ended`: `active` while it runs.
 */
export interface AgentAttemptHistory {
  readonly attemptId: string;
  readonly provider: string;
  readonly model?: string;
  readonly sessionId: string;
  readonly turns: number;
  readonly ended: 'active' | 'finished' | 'returned' | 'taken-over' | 'abandoned';
  /** The owner's attempt that took it over. */
  readonly takenOverBy?: { readonly attempt: number };
  /** The owner's return during the attempt, while it waits to apply or once it was refused. */
  readonly returnRequest?: {
    readonly to: string;
    readonly requestedAt: string;
    readonly state: 'requested' | 'applied' | 'refused';
    readonly refusal?: { readonly code: string; readonly message: string };
  };
  readonly proposal?: {
    readonly transition: string;
    readonly state: 'pending' | 'refused' | 'finalized';
    readonly submittedAt: string;
    readonly refusal?: {
      readonly code: string;
      readonly message: string;
      readonly paths?: readonly string[];
    };
  };
  readonly events: readonly AgentAttemptEvent[];
  readonly work: AgentAttemptWork;
}

/** What the agent detail of a run's attempts is read from. */
export interface AgentHistoryInput {
  readonly subject: WorkflowSubject;
  readonly attempts: readonly AttemptRecord[];
  /** The Specification's Task manifests (the drafts a producing attempt made). */
  readonly manifests: readonly TaskManifest[];
}

export interface AgentHistorySources {
  journal(attemptId: string): Promise<AgentAttemptJournal | undefined>;
  /** The uncommitted-changes ledger entries of a Specification in a checkout. */
  ledger(workspaceId: string, specId: string): Promise<readonly LedgerEntry[]>;
}

const keyOf = (record: { readonly step: string; readonly attempt: number }) =>
  `${record.step}#${String(record.attempt)}`;

/**
 * The agent detail of every agent attempt of a run, by `step#attempt`; an attempt without its
 * journal (removed by hand) has none. Lock-free reads.
 */
export async function readAgentAttemptHistory(
  sources: AgentHistorySources,
  input: AgentHistoryInput,
): Promise<ReadonlyMap<string, AgentAttemptHistory>> {
  const found = new Map<string, AgentAttemptHistory>();
  const ledgers = new Map<string, Promise<readonly LedgerEntry[]>>();
  for (const record of input.attempts) {
    const binding = agentAttemptBindingOf(record as AttemptRecord<WorkflowActor>);
    const journal = binding ? await sources.journal(binding.attemptId) : undefined;
    if (!binding || !journal) {
      continue;
    }

    let ledger = ledgers.get(binding.workspaceId);
    if (!ledger) {
      ledger = sources.ledger(binding.workspaceId, input.subject.specId);
      ledgers.set(binding.workspaceId, ledger);
    }

    found.set(keyOf(record), agentAttemptHistoryOf(record, journal, await ledger, input));
  }

  return found;
}

/** The history of one agent attempt from its run record, its journal and the ledger. Pure. */
export function agentAttemptHistoryOf(
  record: AttemptRecord,
  journal: AgentAttemptJournal,
  ledger: readonly LedgerEntry[],
  input: Pick<AgentHistoryInput, 'subject' | 'manifests'>,
): AgentAttemptHistory {
  const outcome = record.outcome;
  const ended: AgentAttemptHistory['ended'] =
    outcome === undefined ? 'active' : outcome.kind === 'transition' ? 'finished' : outcome.kind;
  const { proposal, returnRequest, takeOver } = journal;
  const actor = journal.actor.details;

  return {
    attemptId: journal.operationId,
    provider: actor.provider,
    ...(actor.model !== undefined ? { model: actor.model } : {}),
    sessionId: actor.sessionId ?? '',
    turns: journal.turns.length,
    ended,
    ...(takeOver ? { takenOverBy: { attempt: takeOver.attempt } } : {}),
    ...(returnRequest
      ? {
          returnRequest: {
            to: returnRequest.step,
            requestedAt: returnRequest.requestedAt,
            state: returnRequest.state,
            ...(returnRequest.refusal
              ? {
                  refusal: {
                    code: returnRequest.refusal.code,
                    message: returnRequest.refusal.message,
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(proposal
      ? {
          proposal: {
            transition: proposal.transition,
            state: proposal.state,
            submittedAt: proposal.submittedAt,
            ...(proposal.refusal
              ? {
                  refusal: {
                    code: proposal.refusal.code,
                    message: proposal.refusal.message,
                    ...(proposal.refusal.attribution
                      ? { paths: [...proposal.refusal.attribution.paths] }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    events: eventsOf(record, journal),
    work: workOf(record, journal, ledger, input),
  };
}

function eventsOf(record: AttemptRecord, journal: AgentAttemptJournal): AgentAttemptEvent[] {
  const events: AgentAttemptEvent[] = [{ kind: 'started', at: record.startedAt }];
  journal.turns.forEach((turn, index) => {
    const number = index + 1;
    events.push({ kind: 'turn-started', at: turn.boundAt, turn: number });
    if (turn.finalizedAt !== undefined) {
      if (
        journal.proposal?.state === 'refused' &&
        journal.proposal.invocationId === turn.invocationId &&
        journal.proposal.refusal
      ) {
        events.push({
          kind: 'proposal-refused',
          at: turn.finalizedAt,
          turn: number,
          code: journal.proposal.refusal.code,
        });
      }

      events.push({ kind: 'turn-ended', at: turn.finalizedAt, turn: number });
    }
  });

  const returnRequest = journal.returnRequest;
  if (returnRequest) {
    events.push({ kind: 'return-requested', at: returnRequest.requestedAt });
  }

  const outcome = record.outcome;
  const endedAt = record.endedAt !== undefined ? { at: record.endedAt } : {};
  if (outcome?.kind === 'transition') {
    events.push({ kind: 'finished', ...endedAt });
  } else if (outcome !== undefined) {
    events.push({ kind: outcome.kind, ...endedAt });
  }

  for (const action of journal.postActions ?? []) {
    if (action.state === 'pending') {
      continue;
    }

    const at = action.ranAt !== undefined ? { at: action.ranAt } : {};
    const runs = action.runs !== undefined ? { runs: action.runs } : {};
    const failed = action.outcomes?.find((entry) => entry.status === 'failed');
    events.push(
      action.state === 'failed'
        ? { kind: 'commit-failed', ...at, ...runs, code: failed?.code ?? 'FAILED' }
        : { kind: 'committed', ...at, ...runs },
    );
  }

  // Stable by time where every event has one; the order above already follows the attempt.
  return events;
}

function workOf(
  record: AttemptRecord,
  journal: AgentAttemptJournal,
  ledger: readonly LedgerEntry[],
  input: Pick<AgentHistoryInput, 'subject' | 'manifests'>,
): AgentAttemptWork {
  const selection = selectAttemptLedgerEntries(ledger, attemptInvocations(journal));
  const tasks =
    input.subject.kind === 'specification'
      ? input.manifests
          .filter(
            (task) =>
              task.origin.kind === 'produced' &&
              task.origin.step === record.step &&
              task.origin.attempt === record.attempt,
          )
          .map((task) => task.id)
          .sort()
      : [];
  const commit = journal.postActions?.find((action) => action.kind === 'attempt-commit');
  const failed = commit?.outcomes?.find((entry) => entry.status === 'failed');
  const dirty = journal.dirtySet;

  return {
    documents: selection.paths,
    mixed: selection.mixed,
    tasks,
    declared: [...(journal.proposal?.changes?.paths ?? [])],
    ...(dirty
      ? {
          changed: {
            paths: dirty.paths.map((entry) => entry.path),
            ...(dirty.truncated ? { truncated: true as const } : {}),
          },
        }
      : {}),
    commit: commit
      ? {
          state:
            commit.state === 'done'
              ? 'committed'
              : commit.state === 'failed'
                ? 'failed'
                : 'pending',
          ...(failed?.code !== undefined ? { code: failed.code } : {}),
          ...(commit.runs !== undefined ? { runs: commit.runs } : {}),
        }
      : { state: 'none' },
  };
}
