import { ERROR_DETAIL_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import { readExecutionJournal } from '../../../execution/journal';
import type { WorkspaceExecutionIntent } from '../../../execution/model';
import { foldPathKey } from '../../document-rules/document-paths';
import type { DocumentError } from '../../document-rules/errors';
import {
  ledgerAuthorsOf,
  listLedgerRecords,
  type LedgerEntry,
  type OwnedExecution,
} from '../../durable';
import { documentChangeError } from '../changes/errors';
import type { DocumentChangePlan } from '../changes/plan/model';
import type { WriteRuntime } from './writer-types';

/**
 * Whether two agent executions are the same author of uncommitted work: for a Turn without an agent
 * attempt (D11b) the same Session (`ownerId`), whose Turns are one conversation. The attempt
 * binding (T11) narrows this to the same attempt, read from the same durable intent.
 */
export function sameAuthor(
  current: WorkspaceExecutionIntent,
  other: WorkspaceExecutionIntent,
): boolean {
  return current.ownerId === other.ownerId;
}

/**
 * The paths of a planned agent write whose uncommitted ledger entry holds an operation of another
 * author (D11, B3): the agent must not build on someone else's uncommitted change, because the
 * attempt commit takes only entries whose every operation is the agent's own. A path is foreign
 * when its durable authors (`ledgerAuthorsOf`, never truncated) include an operation made without
 * an execution or by an execution `authored` rejects. Pure.
 */
export function foreignLedgerPaths(
  entries: readonly LedgerEntry[],
  planned: readonly string[],
  authored: (executionId: string) => boolean,
): string[] {
  const byPath = new Map(entries.map((entry) => [foldPathKey(entry.path), entry]));
  const foreign: string[] = [];
  for (const path of planned) {
    const entry = byPath.get(foldPathKey(path));
    if (entry === undefined) {
      continue;
    }

    const authors = ledgerAuthorsOf(entry);
    if (authors.unattributed === true || authors.executions.some((id) => !authored(id))) {
      foreign.push(entry.path);
    }
  }

  return foreign;
}

const COMMIT_FIRST =
  'Another author changed these files and did not commit them; ask the owner to commit them first, then retry.';

/**
 * The refusal of an agent Turn's write that would build on another author's uncommitted change, or
 * `undefined`. The ledger of every owner of the checkout counts (a Specification's documents and the
 * definitions); authorship is read from the durable intents of the execution claims the entries
 * name, so it survives a restart. A ledger that cannot be read in full, or a claim that cannot be
 * read, refuses too: attribution is never guessed. Called under the control lock of the reservation.
 */
export async function foreignUncommitted(
  rt: WriteRuntime,
  workspaceId: string,
  plan: DocumentChangePlan,
  owned: OwnedExecution,
): Promise<DocumentError | undefined> {
  const unattributable = () =>
    documentChangeError(
      'foreign-uncommitted',
      'The uncommitted changes of this checkout cannot be attributed; ask the owner to commit or recover them first.',
    );
  const listing = await listLedgerRecords(rt.context, { workspaceId });
  if (listing.unreadable > 0 || listing.truncated) {
    return unattributable();
  }

  const planned = new Set(plan.paths.map((path) => foldPathKey(path.path)));
  const entries = listing.records
    .flatMap((record) => record.entries)
    .filter((entry) => planned.has(foldPathKey(entry.path)));
  if (entries.length === 0) {
    return undefined;
  }

  const current = await readExecutionJournal(rt.context, owned.operationId).catch(() => undefined);
  if (current === undefined) {
    return unattributable();
  }

  const same = new Set<string>([owned.operationId]);
  const ids = new Set(entries.flatMap((entry) => ledgerAuthorsOf(entry).executions));
  for (const executionId of ids) {
    if (same.has(executionId)) {
      continue;
    }

    const other = await readExecutionJournal(rt.context, executionId).catch(() => undefined);
    if (other !== undefined && sameAuthor(current.intent, other.intent)) {
      same.add(executionId);
    }
  }

  const foreign = foreignLedgerPaths(
    entries,
    plan.paths.map((path) => path.path),
    (executionId) => same.has(executionId),
  );

  return foreign.length === 0
    ? undefined
    : documentChangeError('foreign-uncommitted', COMMIT_FIRST, {
        paths: foreign.sort().slice(0, ERROR_DETAIL_PATHS_MAX),
      });
}
