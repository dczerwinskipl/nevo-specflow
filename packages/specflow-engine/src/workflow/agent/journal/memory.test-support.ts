import { parseAgentAttemptJournal, type AgentAttemptJournal } from './model';
import type { AgentAttemptJournalStore } from './store';

/** Journals in memory, validated like the files on every write and read. */
export function memoryAgentAttemptJournal(): AgentAttemptJournalStore & {
  readonly journals: Map<string, AgentAttemptJournal>;
} {
  const journals = new Map<string, AgentAttemptJournal>();

  return {
    journals,
    read(attemptId) {
      const stored = journals.get(attemptId);

      return Promise.resolve(
        stored && parseAgentAttemptJournal(structuredClone(stored), attemptId),
      );
    },
    publish(journal) {
      journals.set(
        journal.operationId,
        parseAgentAttemptJournal(structuredClone(journal), journal.operationId),
      );

      return Promise.resolve();
    },
  };
}
