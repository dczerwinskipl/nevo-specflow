import type { ResolvedProjectHome } from '../../../project/home/home';
import type { DocumentChangeJournal } from '../../../specs/documents/changes/journal/model';
import { isWriterStage } from '../../../specs/documents/changes/journal/stages';
import { listDocumentChangeJournals } from '../../../specs/documents/write/journal-store';

/**
 * The agent execution a document change was written for: its journal's `agent.executionId`, recorded
 * by a broker write of an owned execution; `undefined` for any other writer.
 */
export function documentChangeExecutionId(journal: DocumentChangeJournal): string | undefined {
  const agent = (journal as { readonly agent?: { readonly executionId?: unknown } }).agent;

  return typeof agent?.executionId === 'string' ? agent.executionId : undefined;
}

/**
 * Whether the change has not finished writing its files: a writer stage, or a recovery that stopped
 * in the write. A change waiting for its commit has written everything and does not count.
 */
function writing(journal: DocumentChangeJournal): boolean {
  return (
    isWriterStage(journal.stage) ||
    (journal.stage === 'recovery-required' && journal.recoveryPhase === 'write')
  );
}

/**
 * The document changes of the execution `invocationId` (an agent Turn) that are still writing: a
 * broker write that outlived the Turn's capability. The finalize of that Turn refuses while one
 * exists, so neither the step publication nor the dirty set misses its files.
 */
export async function openDocumentWritesOf(
  context: ResolvedProjectHome,
  invocationId: string,
): Promise<readonly string[]> {
  return (await listDocumentChangeJournals(context))
    .filter((journal) => documentChangeExecutionId(journal) === invocationId && writing(journal))
    .map((journal) => journal.operationId);
}
