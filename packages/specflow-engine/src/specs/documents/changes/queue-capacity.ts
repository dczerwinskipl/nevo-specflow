import type { DocumentChangeJournal } from './journal/model';
import {
  DOCUMENT_QUEUE_MAX_JOURNALS_PER_CHECKOUT,
  DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT,
} from './limits';

/** Stages in which an operation waits for a person and the Engine does nothing with it. */
export const WAITS_FOR_A_PERSON: ReadonlySet<string> = new Set([
  'commit-failed',
  'recovery-required',
]);

/**
 * Whether a checkout can take one more document change. The reservation refuses with `queue-full`
 * (a wait can lift it) or `held-limit` (only a person's decision can); the document tree reports the
 * same two states as `busy` for every write, from the same journals. Pure.
 */
export type QueueCapacity = 'open' | 'queue-full' | 'held-limit';

/** `journals` are the active journals of ONE checkout. */
export function queueCapacityOf(
  journals: readonly Pick<DocumentChangeJournal, 'stage'>[],
): QueueCapacity {
  // Operations that wait for a person do not fill the queue (they are bounded by the larger cap).
  const waiting = journals.filter((journal) => WAITS_FOR_A_PERSON.has(journal.stage)).length;
  if (journals.length - waiting >= DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT) return 'queue-full';
  // What waits for a person has to be acted on, so it is bounded by a larger cap of its own.
  if (journals.length >= DOCUMENT_QUEUE_MAX_JOURNALS_PER_CHECKOUT) return 'held-limit';
  return 'open';
}
