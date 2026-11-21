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
  /** Ids listed as corrupt journal files. */
  readonly unreadable: Set<string>;
} {
  const journals = new Map<string, AgentAttemptJournal>();
  const settled = new Map<string, AgentAttemptJournal>();
  const unreadable = new Set<string>();
  const parsed = (journal: AgentAttemptJournal) =>
    parseAgentAttemptJournal(structuredClone(journal), journal.operationId);

  return {
    journals,
    settled,
    unreadable,
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
    listActive: () =>
      Promise.resolve({
        journals: [...journals.values()].map(parsed),
        unreadable: [...unreadable],
        truncated: false,
      }),
  };
}
