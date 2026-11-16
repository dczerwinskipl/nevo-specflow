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

/**
 * The refusal of a document write whose claim check found a conflicting holder. A document write
 * claims `checkout-scoped:<workspaceId>`, which coexists with other document changes and manual
 * commits, so the holder is a Close or a Create into this checkout, or an agent Session Turn that
 * holds the project-wide write claim (named by the claim source's message, with its Session).
 */
export function claimConflictOf(error: SharedResourceError): {
  readonly cause: 'busy-agent-turn' | 'busy-agent-turn-unknown' | 'busy-create-or-close';
  readonly message: string;
} {
  if (error.holder?.kind === 'external') {
    // `unknown`: the Turn has ended; only resolving its Session releases the claim.
    return {
      cause: error.holder.phase === 'unknown' ? 'busy-agent-turn-unknown' : 'busy-agent-turn',
      message: error.message,
    };
  }

  return { cause: 'busy-create-or-close', message: 'A Create or Close holds this checkout.' };
}
