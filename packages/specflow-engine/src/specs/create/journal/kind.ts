import type { JournalKind } from '../../durable';
import { CreateOperationError } from '../error';
import { CREATE_JOURNAL_LISTING_MAX_FILES, CREATE_JOURNAL_MAX_BYTES } from '../limits';
import { invalidJournal, parseCreateJournal } from './codec';
import { CREATE_JOURNAL_VERSION, type CreateJournal } from './model';
import { unsupportedJournalError } from './unsupported';

export const CREATE_JOURNAL_RELATIVE_DIR = 'engine/operations/create';

/** The Create journal as one kind of the generic durable core. */
export const CREATE_JOURNAL_KIND: JournalKind<CreateJournal> = {
  name: 'create',
  label: 'Create',
  relativeDir: CREATE_JOURNAL_RELATIVE_DIR,
  version: CREATE_JOURNAL_VERSION,
  maxBytes: CREATE_JOURNAL_MAX_BYTES,
  listingMaxFiles: CREATE_JOURNAL_LISTING_MAX_FILES,
  parse: parseCreateJournal,
  // The only terminal, fully settled state in the journal model is `completed`.
  isSettled: (journal) => journal.stage === 'completed',
  errors: {
    invalid: invalidJournal,
    unsupported: unsupportedJournalError,
    invalidOperationId: () =>
      new CreateOperationError('CREATE_OPERATION_INVALID', 'A UUID operationId is required.'),
    payloadUnprovable: (message) => new CreateOperationError('CREATE_RECOVERY_REQUIRED', message),
  },
};
