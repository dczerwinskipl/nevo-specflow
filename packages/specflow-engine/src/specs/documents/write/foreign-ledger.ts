import { ERROR_DETAIL_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import { foldPathKey } from '../../document-rules/document-paths';
import type { DocumentError } from '../../document-rules/errors';
import { listLedgerRecords, type LedgerEntry, type OwnedExecution } from '../../durable';
import { documentChangeError } from '../changes/errors';
import type { DocumentChangePlan } from '../changes/plan/model';
import type { WriteRuntime } from './writer-types';

/**
 * The paths of a planned agent write whose uncommitted ledger entry holds an operation of another
 * author (D11, B3): the agent must not build on someone else's uncommitted change, because the
 * attempt commit takes only entries whose every operation is the agent's own. A path is foreign
 * when any recorded operation is not `authored`, or when the entry kept fewer operation ids than it
 * counts (the oldest were dropped and cannot be attributed: fail closed). Pure.
 */
export function foreignLedgerPaths(
  entries: readonly LedgerEntry[],
  planned: readonly string[],
  authored: (operationId: string) => boolean,
): string[] {
  const byPath = new Map(entries.map((entry) => [foldPathKey(entry.path), entry]));
  const foreign: string[] = [];
  for (const path of planned) {
    const entry = byPath.get(foldPathKey(path));
    if (entry === undefined) {
      continue;
    }

    if (
      entry.operationCount > entry.operationIds.length ||
      entry.operationIds.some((operationId) => !authored(operationId))
    ) {
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
 * definitions). A ledger that cannot be read in full refuses too: attribution is never guessed.
 * Called under the control lock of the reservation.
 */
export async function foreignUncommitted(
  rt: WriteRuntime,
  workspaceId: string,
  plan: DocumentChangePlan,
  owned: OwnedExecution,
): Promise<DocumentError | undefined> {
  const listing = await listLedgerRecords(rt.context, { workspaceId });
  if (listing.unreadable > 0 || listing.truncated) {
    return documentChangeError(
      'foreign-uncommitted',
      'The uncommitted changes of this checkout cannot be attributed; ask the owner to commit or recover them first.',
    );
  }

  const foreign = foreignLedgerPaths(
    listing.records.flatMap((record) => record.entries),
    plan.paths.map((path) => path.path),
    owned.authored ?? (() => false),
  );

  return foreign.length === 0
    ? undefined
    : documentChangeError('foreign-uncommitted', COMMIT_FIRST, {
        paths: foreign.sort().slice(0, ERROR_DETAIL_PATHS_MAX),
      });
}
