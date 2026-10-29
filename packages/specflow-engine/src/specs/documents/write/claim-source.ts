import { SharedResourceError, type ClaimSource } from '../../durable';
import { DocumentError } from '../../document-rules/errors';
import { assertDocumentChangeClaimsAvailable } from '../changes/claims';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { listDocumentChangeJournals } from './journal-store';

/**
 * Document-change journals as a claim source of `assertSharedResourcesAvailable`: every journal
 * that holds a claim reserves `checkout-scoped:<workspaceId>`, so Close (`checkout:<workspaceId>`)
 * and a Create into that checkout's integration destination see it, and other document changes and
 * Creates in the checkout coexist with it. A corrupt journal fails closed as a journal-corruption
 * conflict, like the Create and Close sources.
 */
export const documentChangeClaims: ClaimSource<DocumentChangeJournal> = {
  list: async (context) => {
    try {
      return await listDocumentChangeJournals(context);
    } catch (error) {
      if (error instanceof DocumentError) {
        throw new SharedResourceError(
          'RESOURCE_JOURNAL_CORRUPT',
          'A document change journal is corrupt or unreadable; recover it.',
        );
      }

      throw error;
    }
  },
  assertAvailable: assertDocumentChangeClaimsAvailable,
};
