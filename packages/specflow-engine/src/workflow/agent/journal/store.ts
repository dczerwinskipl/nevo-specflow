import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  ensureJournalDirectory,
  listJournalRowsTolerant,
  moveJournalToSettled,
  publishJournal,
  readJournal,
  readSettledJournal,
} from '../../../specs/durable';
import { WorkflowError } from '../../errors';
import {
  AGENT_ATTEMPT_JOURNAL_KIND,
  isAttemptJournalSettled,
  type AgentAttemptJournal,
} from './model';

/**
 * Where the agent attempt journals are kept. `publish` and `settle` are called inside the workflow's
 * `serialize` section (the project control lock in production), like every write of the attempt;
 * `read` and `listActive` need no lock (a journal file is replaced or moved atomically).
 */
export interface AgentAttemptJournalStore {
  /** The journal wherever it is: the active directory first, then `settled/`. */
  read(attemptId: string): Promise<AgentAttemptJournal | undefined>;
  publish(journal: AgentAttemptJournal): Promise<void>;
  /**
   * Move the journal of an attempt that ended with nothing left to run into `settled/`, where
   * {@link listActive} no longer sees it; absent or settled already is fine.
   */
  settle(attemptId: string): Promise<void>;
  /**
   * The journals not yet settled, what recovery looks at: at most the kind's `listingMaxFiles`
   * (`truncated` when more exist); a file that cannot be read is named in `unreadable`, never an error.
   */
  listActive(): Promise<AgentAttemptJournalListing>;
}

export interface AgentAttemptJournalListing {
  readonly journals: readonly AgentAttemptJournal[];
  /** The attempt ids whose journal file is corrupt or unreadable. */
  readonly unreadable: readonly string[];
  readonly truncated: boolean;
}

type ListedRow =
  | { readonly kind: 'journal'; readonly journal: AgentAttemptJournal }
  | { readonly kind: 'unreadable'; readonly attemptId: string }
  /** Settled or removed between the listing and the read. */
  | { readonly kind: 'gone' };

export function refuseUnsettledAgentAttempt(): never {
  throw new WorkflowError(
    'WORKFLOW_STATE_CORRUPT',
    'Only an agent attempt that ended with nothing left to run is settled.',
  );
}

/** The journals under the Project's local state (`engine/operations/agent-attempt`). */
export function filesystemAgentAttemptJournal(
  context: ResolvedProjectHome,
): AgentAttemptJournalStore {
  const kind = AGENT_ATTEMPT_JOURNAL_KIND;

  return {
    async read(attemptId) {
      return (
        (await readJournal(context, kind, attemptId)) ??
        (await readSettledJournal(context, kind, attemptId))
      );
    },
    async publish(journal) {
      await ensureJournalDirectory(context, kind);
      await publishJournal(context, kind, journal);
    },
    async settle(attemptId) {
      const active = await readJournal(context, kind, attemptId);
      if (active === undefined) {
        return;
      }

      if (!isAttemptJournalSettled(active)) {
        refuseUnsettledAgentAttempt();
      }

      await moveJournalToSettled(context, kind, attemptId);
    },
    async listActive() {
      let truncated = false;
      const rows = await listJournalRowsTolerant<ListedRow>(
        context,
        kind,
        {
          async readRow(_path, attemptId) {
            try {
              const journal = await readJournal(context, kind, attemptId);

              return journal ? { kind: 'journal', journal } : { kind: 'gone' };
            } catch {
              return { kind: 'unreadable', attemptId };
            }
          },
          unreadable: (attemptId) => ({ kind: 'unreadable', attemptId }),
        },
        { onTruncated: () => (truncated = true) },
      );

      return {
        journals: rows.flatMap((row) => (row.kind === 'journal' ? [row.journal] : [])),
        unreadable: rows.flatMap((row) => (row.kind === 'unreadable' ? [row.attemptId] : [])),
        truncated,
      };
    },
  };
}
