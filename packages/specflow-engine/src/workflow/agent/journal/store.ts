import type { ResolvedProjectHome } from '../../../project/home/home';
import { ensureJournalDirectory, publishJournal, readJournal } from '../../../specs/durable';
import { AGENT_ATTEMPT_JOURNAL_KIND, type AgentAttemptJournal } from './model';

/**
 * Where the agent attempt journals are kept. `publish` is called inside the workflow's `serialize`
 * section (the project control lock in production), like every write of the attempt; `read` needs no
 * lock (a journal file is replaced atomically).
 */
export interface AgentAttemptJournalStore {
  read(attemptId: string): Promise<AgentAttemptJournal | undefined>;
  publish(journal: AgentAttemptJournal): Promise<void>;
}

/** The journals under the Project's local state (`engine/operations/agent-attempt`). */
export function filesystemAgentAttemptJournal(
  context: ResolvedProjectHome,
): AgentAttemptJournalStore {
  return {
    read: (attemptId) => readJournal(context, AGENT_ATTEMPT_JOURNAL_KIND, attemptId),
    async publish(journal) {
      await ensureJournalDirectory(context, AGENT_ATTEMPT_JOURNAL_KIND);
      await publishJournal(context, AGENT_ATTEMPT_JOURNAL_KIND, journal);
    },
  };
}
