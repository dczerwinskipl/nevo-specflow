import {
  SharedResourceError,
  overlaps,
  sortedResources,
  type ClaimSelf,
  type MutationResource,
} from '../../durable/claims';
import type { DocumentChangeJournal } from './journal/model';
import { DOCUMENT_CHANGE_STAGE_FACTS } from './journal/stages';

/**
 * Resources a document operation claims: the scoped claim of its checkout and nothing else. It
 * coexists with other document operations and with Create (every `checkout-scoped:` claim does),
 * and is excluded by Close, whose `checkout:<workspaceId>` claim pairs with it. There is no
 * per-Specification claim: operations of one Specification must coexist so that they consolidate.
 * Per-Specification isolation is the batching rule (`queue/formation`), not a claim.
 */
export function resourcesForDocumentChange(
  record: Pick<DocumentChangeJournal, 'workspaceId'>,
): readonly MutationResource[] {
  return sortedResources(['checkout-scoped:' + record.workspaceId]);
}

/** Whether the journal is a resource claim: see `DOCUMENT_CHANGE_STAGE_FACTS`. */
export function documentChangeHoldsClaim(journal: Pick<DocumentChangeJournal, 'stage'>): boolean {
  return DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].holdsClaim;
}

/**
 * The conflict rule of document journals for `assertSharedResourcesAvailable`: the pure half of a
 * `ClaimSource` (the listing is the store's). Only journals that hold a claim count; the operation
 * asking never conflicts with its own journal.
 */
export function assertDocumentChangeClaimsAvailable(
  records: readonly DocumentChangeJournal[],
  requested: readonly MutationResource[],
  self: ClaimSelf | undefined,
): void {
  for (const record of records) {
    if (self?.kind === 'document-change' && self.operationId === record.operationId) continue;
    if (!documentChangeHoldsClaim(record)) continue;
    if (overlaps(requested, resourcesForDocumentChange(record))) {
      throw new SharedResourceError(
        'RESOURCE_CONFLICT',
        'Unfinished document changes reserve this checkout; flush, retry, abandon or recover them.',
      );
    }
  }
}
