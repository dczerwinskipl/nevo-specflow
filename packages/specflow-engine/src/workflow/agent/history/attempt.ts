import type { AttemptRecord } from '@nevo/workflow';

import { runReadRequest } from '../../../project/request-verification-memo';
import type { LedgerEntry } from '../../../specs/durable/ledger/model';
import { TASKS_FOLDER, type TaskManifest } from '../../../tasks/resource/model';
import { EXECUTION_DIRECTORY } from '../../../specs/execution-paths';
import { agentAttemptBindingOf, type WorkflowActor, type WorkflowSubject } from '../../state/model';
import {
  attemptInvocations,
  selectAttemptLedgerEntries,
} from '../finalize/attempt-commit/selection';
import type { AgentAttemptChanges, AgentAttemptWork } from '../../operations/actions';
import { loadSubject, type WorkflowDependencies } from '../../operations/loaded-execution';
import type { AgentAttemptJournal } from '../journal/model';

export type { AgentAttemptChanges, AgentAttemptWork };

export const AGENT_ATTEMPT_EVENT_KINDS = [
  'started',
  /** The attempt started when the owner handed their attempt of the step to the agent. */
  'handed-over',
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
  'awaiting-confirmation',
  'confirmed',
  'rejected',
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
  /** A `turn-started` the owner sent a note with (a Continue's note for the agent). */
  readonly note?: string;
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
  /** The owner's attempt that handed the step to the agent (Hand to agent), when one did. */
  readonly handedOverFrom?: { readonly attempt: number };
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
  /**
   * Where the Specification lies in a checkout and which documents it registers, to tell an
   * attempt's documents from its other files (`AgentAttemptChanges`); `undefined` when the
   * Specification is not in that checkout. Without it the work names no `changes`.
   */
  specification?(workspaceId: string, specId: string): Promise<AttemptSpecification | undefined>;
}

/** The Specification as an attempt's changes are read against it. */
export interface AttemptSpecification {
  /** Its folder, checkout-relative (`specs/active/<slug>`). */
  readonly directory: string;
  /** Its registered documents, checkout-relative. */
  readonly documents: readonly string[];
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
  const specifications = new Map<string, Promise<AttemptSpecification | undefined>>();
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

    let specification = specifications.get(binding.workspaceId);
    if (!specification && sources.specification) {
      specification = sources.specification(binding.workspaceId, input.subject.specId);
      specifications.set(binding.workspaceId, specification);
    }

    // The owner's attempt before it ended taken over by this one: the owner handed the step over.
    const previous = input.attempts.find(
      (candidate) => candidate.step === record.step && candidate.attempt === record.attempt - 1,
    );
    const handedOverFrom =
      previous?.outcome?.kind === 'taken-over' &&
      (previous.actor as WorkflowActor | undefined)?.class === 'human'
        ? previous.attempt
        : undefined;
    found.set(
      keyOf(record),
      agentAttemptHistoryOf(record, journal, await ledger, {
        ...input,
        ...(handedOverFrom !== undefined ? { handedOverFrom } : {}),
        ...(specification ? { specification: await specification } : {}),
      }),
    );
  }

  return found;
}

/** The history of one agent attempt from its run record, its journal and the ledger. Pure. */
export function agentAttemptHistoryOf(
  record: AttemptRecord,
  journal: AgentAttemptJournal,
  ledger: readonly LedgerEntry[],
  input: WorkInput & {
    /** The owner's attempt that handed the step to this one (Hand to agent). */
    readonly handedOverFrom?: number;
  },
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
    ...(input.handedOverFrom !== undefined
      ? { handedOverFrom: { attempt: input.handedOverFrom } }
      : {}),
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
    events: eventsOf(record, journal, input.handedOverFrom !== undefined),
    work: workOf(record, journal, ledger, input),
  };
}

function eventsOf(
  record: AttemptRecord,
  journal: AgentAttemptJournal,
  handedOver: boolean,
): AgentAttemptEvent[] {
  const events: AgentAttemptEvent[] = [
    { kind: handedOver ? 'handed-over' : 'started', at: record.startedAt },
  ];
  journal.turns.forEach((turn, index) => {
    const number = index + 1;
    events.push({
      kind: 'turn-started',
      at: turn.boundAt,
      turn: number,
      ...(turn.ownerNote !== undefined ? { note: turn.ownerNote } : {}),
    });
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
  const confirmation = record.confirmation;
  if (outcome?.kind === 'transition') {
    events.push({ kind: 'finished', ...endedAt });
    if (confirmation) {
      // The result waits for the owner (D17); its attempt commit ran at the finish all the same.
      events.push({ kind: 'awaiting-confirmation', ...endedAt });
    }
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

  if (confirmation && confirmation.state !== 'pending') {
    events.push({ kind: confirmation.state, at: confirmation.at });
  }

  // Stable by time where every event has one; the order above already follows the attempt.
  return events;
}

/**
 * What an agent attempt left, for the projection: its run record from one snapshot read, its journal,
 * and only its Specification's ledger record. Git-free and lock-free: an Engine read request, whose
 * reads verify the Project Home and checkout from on-disk evidence.
 */
export function readAgentAttemptWork(
  workflow: Pick<WorkflowDependencies, 'catalogue' | 'store'>,
  sources: Pick<AgentHistorySources, 'ledger' | 'specification'>,
  journal: AgentAttemptJournal,
): Promise<AgentAttemptWork> {
  return runReadRequest(() => attemptWorkOf(workflow, sources, journal));
}

async function attemptWorkOf(
  workflow: Pick<WorkflowDependencies, 'catalogue' | 'store'>,
  sources: Pick<AgentHistorySources, 'ledger' | 'specification'>,
  journal: AgentAttemptJournal,
): Promise<AgentAttemptWork> {
  const { subject } = journal;
  const snapshot = await workflow.store.read(subject.specId);
  const record = loadSubject(workflow.catalogue, snapshot, subject).run.attempts.find(
    (attempt) => agentAttemptBindingOf(attempt)?.attemptId === journal.operationId,
  );
  if (!record) {
    return { documents: [], mixed: [], tasks: [], declared: [], commit: { state: 'none' } };
  }

  const specification = sources.specification
    ? { specification: await sources.specification(journal.workspaceId, subject.specId) }
    : {};

  return workOf(record, journal, await sources.ledger(journal.workspaceId, subject.specId), {
    subject,
    manifests: snapshot.manifests.map((entry) => entry.value),
    ...specification,
  });
}

/** What the work of an attempt is read against. */
type WorkInput = Pick<AgentHistoryInput, 'subject' | 'manifests'> & {
  /** The Specification's folder and registry; `undefined`: read but not in the checkout. */
  readonly specification?: AttemptSpecification | undefined;
};

function workOf(
  record: AttemptRecord,
  journal: AgentAttemptJournal,
  ledger: readonly LedgerEntry[],
  input: WorkInput,
): AgentAttemptWork {
  const selection = selectAttemptLedgerEntries(ledger, attemptInvocations(journal));
  const produced =
    input.subject.kind === 'specification'
      ? input.manifests
          .filter(
            (task) =>
              task.origin.kind === 'produced' &&
              task.origin.step === record.step &&
              task.origin.attempt === record.attempt,
          )
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      : [];
  const tasks = produced.map((task) => task.id);
  const commit = journal.postActions?.find((action) => action.kind === 'attempt-commit');
  const failed = commit?.outcomes?.find((entry) => entry.status === 'failed');
  const made =
    commit?.state === 'done' ? commit.outcomes?.find((entry) => entry.commit)?.commit : undefined;
  const dirty = journal.dirtySet;
  const declared = journal.proposal?.changes?.paths ?? [];
  const changes = input.specification
    ? attemptChangesOf({
        specification: input.specification,
        subject: input.subject,
        manifests: input.manifests,
        produced,
        paths: [...selection.paths, ...selection.mixed, ...(made?.paths ?? []), ...declared],
        ...(made?.truncated ? { truncated: true } : {}),
      })
    : undefined;
  // With the commit's paths named, its counts follow the same groups as `changes`.
  const counts =
    made && changes && made.paths
      ? {
          documents: made.paths.filter((path) => changes.documents.includes(path)).length,
          files: made.paths.filter((path) => changes.files.includes(path)).length,
        }
      : made
        ? { documents: made.documents, files: made.files }
        : undefined;

  return {
    documents: selection.paths,
    mixed: selection.mixed,
    tasks,
    declared: [...declared],
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
          ...(made && counts
            ? { ...(made.sha !== undefined ? { sha: made.sha } : {}), ...counts }
            : {}),
        }
      : { state: 'none' },
    ...(changes ? { changes } : {}),
  };
}

/** The Specification manifest's file name in its folder. */
const MANIFEST_FILE = 'specification.yaml';

/**
 * What an attempt changed, each path in one group (`AgentAttemptChanges`): a registered document
 * of the Specification (or of the Task the attempt works on), SpecFlow's own records below the
 * Specification's folder (`.execution/**`, `tasks/**`, the manifest), else another file. Pure.
 */
export function attemptChangesOf(input: {
  readonly specification: AttemptSpecification;
  readonly subject: WorkflowSubject;
  readonly manifests: readonly TaskManifest[];
  /** The Task drafts the attempt produced. */
  readonly produced: readonly TaskManifest[];
  /** Every path the attempt changed, in any order, repeats allowed. */
  readonly paths: readonly string[];
  readonly truncated?: boolean;
}): AgentAttemptChanges {
  const { directory } = input.specification;
  const subject = input.subject;
  const task =
    subject.kind === 'task'
      ? input.manifests.find((manifest) => manifest.id === subject.taskId)
      : undefined;
  const registered = new Set([
    ...input.specification.documents,
    ...(task
      ? task.documents.map((entry) => `${directory}/${TASKS_FOLDER}/${task.id}/${entry.path}`)
      : []),
  ]);
  const documents: string[] = [];
  const files: string[] = [];
  const state: string[] = [];
  for (const path of [...new Set(input.paths)].sort()) {
    if (registered.has(path)) {
      documents.push(path);
      continue;
    }

    const relative = path.startsWith(directory + '/')
      ? path.slice(directory.length + 1)
      : undefined;
    const own =
      relative !== undefined &&
      (relative === MANIFEST_FILE ||
        relative.startsWith(EXECUTION_DIRECTORY + '/') ||
        relative.startsWith(TASKS_FOLDER + '/'));
    (own ? state : files).push(path);
  }

  return {
    directory,
    documents,
    tasks: input.produced.map((manifest) => ({ id: manifest.id, title: manifest.title })),
    files,
    state,
    ...(input.truncated ? { truncated: true as const } : {}),
  };
}
