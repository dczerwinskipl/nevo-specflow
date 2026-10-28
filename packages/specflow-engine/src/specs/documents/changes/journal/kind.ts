import type { JournalKind } from '../../../durable/journal-store';
import { documentChangeError } from '../errors';
import { DOCUMENT_JOURNAL_LISTING_MAX_FILES, DOCUMENT_JOURNAL_MAX_BYTES } from '../limits';
import {
  invalidDocumentChangeJournal,
  parseDocumentChangeJournal,
  unsupportedDocumentChangeJournal,
} from './codec';
import {
  DOCUMENT_CHANGE_JOURNAL_VERSION,
  DOCUMENT_JOURNAL_RELATIVE_DIR,
  type DocumentChangeJournal,
} from './model';
import { DOCUMENT_CHANGE_STAGE_FACTS } from './stages';

/**
 * The document-change journal as one kind of the generic durable core: the store, the payload store
 * and the retention sweep take their location, version, cap and error vocabulary from here.
 */
export const DOCUMENT_CHANGE_JOURNAL_KIND: JournalKind<DocumentChangeJournal> = {
  name: 'document-change',
  label: 'Document change',
  relativeDir: DOCUMENT_JOURNAL_RELATIVE_DIR,
  version: DOCUMENT_CHANGE_JOURNAL_VERSION,
  maxBytes: DOCUMENT_JOURNAL_MAX_BYTES,
  listingMaxFiles: DOCUMENT_JOURNAL_LISTING_MAX_FILES,
  parse: parseDocumentChangeJournal,
  isSettled: (journal) => DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].settled,
  errors: {
    invalid: invalidDocumentChangeJournal,
    unsupported: unsupportedDocumentChangeJournal,
    invalidOperationId: () =>
      documentChangeError('operation-invalid', 'A UUID operationId is required.'),
    payloadUnprovable: (message) => documentChangeError('payload-unprovable', message),
  },
};
