import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  MAX_JOURNAL_REMOVALS_PER_SWEEP,
  SETTLED_JOURNAL_RETENTION_DAYS,
  STRAY_JOURNAL_TEMP_MAX_AGE_MS,
  removeExpiredSettledJournals,
  type JournalSweepOptions,
} from '../../durable';
import { CREATE_JOURNAL_KIND } from './kind';

/**
 * How long a settled (`completed`) Create journal is kept before a later reservation may delete it.
 * Inside this window an operationId replays idempotently. After it the same operationId is a NEW
 * operation; slug protection then comes from the Specification existing on disk and in the registry.
 * This is independent of (and much longer than) the 10 minutes a completed row stays in the list.
 */
export const COMPLETED_OPERATION_JOURNAL_RETENTION_DAYS = SETTLED_JOURNAL_RETENTION_DAYS;

export { MAX_JOURNAL_REMOVALS_PER_SWEEP, STRAY_JOURNAL_TEMP_MAX_AGE_MS };

/**
 * Removes `completed` and unsupported Create journals older than the retention, stray stage files
 * and orphaned payloads (see `../../durable/retention.ts`). `recovery-required` and every
 * in-progress stage are evidence and are never removed. The caller MUST hold the Project Home
 * control lock. Uses no Git.
 */
export async function removeExpiredCompletedCreateJournals(
  context: ResolvedProjectHome,
  options: JournalSweepOptions = {},
): Promise<number> {
  return removeExpiredSettledJournals(context, CREATE_JOURNAL_KIND, options);
}
