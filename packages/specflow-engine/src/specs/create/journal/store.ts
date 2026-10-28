import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  isStrayJournalTempName,
  journalPath,
  listJournals,
  listJournalsDetailed,
  publishJournal,
  readJournal,
  validateJournalOperationId,
  withJournalLock,
  type JournalListing,
} from '../../durable';
import { CREATE_JOURNAL_KIND, CREATE_JOURNAL_RELATIVE_DIR } from './kind';
import type { CreateJournal } from './model';
import type { UnsupportedCreateJournal } from './unsupported';

export { CREATE_JOURNAL_RELATIVE_DIR, isStrayJournalTempName };

export function validateOperationId(id: string): void {
  validateJournalOperationId(CREATE_JOURNAL_KIND, id);
}

export function createJournalPath(context: ResolvedProjectHome, operationId: string): string {
  return journalPath(context, CREATE_JOURNAL_KIND, operationId);
}

/**
 * The journal of one operation. An unsupported (unreadable) file answers
 * `CREATE_JOURNAL_UNSUPPORTED`; a corrupt current-format file stays `CREATE_JOURNAL_CORRUPT`.
 */
export async function readCreateJournal(
  context: ResolvedProjectHome,
  operationId: string,
): Promise<CreateJournal | undefined> {
  return readJournal(context, CREATE_JOURNAL_KIND, operationId);
}

export type CreateJournalListing = JournalListing<CreateJournal> & {
  readonly unsupported: readonly UnsupportedCreateJournal[];
};

/**
 * Strict listing used by Create and Close admission. Unsupported files are returned separately
 * and never throw or claim; a corrupt current-format journal still fails closed.
 */
export async function listCreateJournalsDetailed(
  context: ResolvedProjectHome,
): Promise<CreateJournalListing> {
  return listJournalsDetailed(context, CREATE_JOURNAL_KIND);
}

/** The current-format journals only (see {@link listCreateJournalsDetailed}). */
export async function listCreateJournals(
  context: ResolvedProjectHome,
): Promise<readonly CreateJournal[]> {
  return listJournals(context, CREATE_JOURNAL_KIND);
}

export async function withCreateJournalLock<T>(
  context: ResolvedProjectHome,
  action: () => Promise<T>,
): Promise<T> {
  return withJournalLock(context, CREATE_JOURNAL_KIND, action);
}

/** Caller MUST hold the Project Home control lock. */
export async function publishCreateJournal(
  context: ResolvedProjectHome,
  record: CreateJournal,
): Promise<void> {
  return publishJournal(context, CREATE_JOURNAL_KIND, record);
}
