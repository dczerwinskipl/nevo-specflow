import {
  isAttemptJournalSettled,
  parseAgentAttemptJournal,
  type AgentAttemptJournal,
} from './model';
import { refuseUnsettledAgentAttempt, type AgentAttemptJournalStore } from './store';

/** Journals in memory, validated like the files on every write and read; `settled` is `settled/`. */
export function memoryAgentAttemptJournal(): AgentAttemptJournalStore & {
  readonly journals: Map<string, AgentAttemptJournal>;
  readonly settled: Map<string, AgentAttemptJournal>;
} {
  const journals = new Map<string, AgentAttemptJournal>();
  const settled = new Map<string, AgentAttemptJournal>();
  const parsed = (journal: AgentAttemptJournal) =>
    parseAgentAttemptJournal(structuredClone(journal), journal.operationId);

  return {
    journals,
    settled,
    read(attemptId) {
      const stored = journals.get(attemptId) ?? settled.get(attemptId);

      return Promise.resolve(stored && parsed(stored));
    },
    publish(journal) {
      journals.set(journal.operationId, parsed(journal));

      return Promise.resolve();
    },
    settle(attemptId) {
      const active = journals.get(attemptId);
      if (active !== undefined) {
        if (!isAttemptJournalSettled(active)) {
          refuseUnsettledAgentAttempt();
        }

        journals.delete(attemptId);
        settled.set(attemptId, active);
      }

      return Promise.resolve();
    },
    listActive: () => Promise.resolve([...journals.values()].map(parsed)),
  };
}
