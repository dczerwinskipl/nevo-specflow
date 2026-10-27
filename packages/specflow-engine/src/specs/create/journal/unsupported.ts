import {
  classifyJournalText,
  isExpiredUnsupportedJournal,
  type JournalFileClass,
  type UnsupportedJournal,
} from '../../durable';
import { CreateOperationError } from '../error';
import { CREATE_JOURNAL_VERSION } from './model';

/**
 * Create's use of the generic rule for journals this Engine cannot interpret (see
 * `../../durable/unsupported.ts` and `docs/architecture/runtime/specification-documents.md`): a
 * journal file is _unsupported_ when its text is not JSON, is not an object with a numeric
 * `version`, or its `version` is not {@link CREATE_JOURNAL_VERSION}. Such a file is never a
 * resource claim, is deleted by retention after its age, and answers `CREATE_JOURNAL_UNSUPPORTED`
 * when read by operation id.
 */
export type CreateJournalFileClass = JournalFileClass;

/** Classifies the text of a Create journal file by its version only. */
export function classifyCreateJournalText(text: string): CreateJournalFileClass {
  return classifyJournalText(text, CREATE_JOURNAL_VERSION);
}

/** The answer of a by-id read of an unsupported journal. */
export function unsupportedJournalError(): CreateOperationError {
  return new CreateOperationError(
    'CREATE_JOURNAL_UNSUPPORTED',
    'The Create operation journal is of an unsupported format and cannot be interpreted.',
  );
}

export { isExpiredUnsupportedJournal };

/** One unsupported journal found by a listing: only what the file name and stat reveal. */
export type UnsupportedCreateJournal = UnsupportedJournal;
