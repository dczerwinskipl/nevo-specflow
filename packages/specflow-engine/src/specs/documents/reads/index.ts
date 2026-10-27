/**
 * Read side of the document queue: the commit state of a Specification, the availability of its
 * write actions, the status of one operation and the rows of the document-change operation list.
 * Lock-free and Git-free; it never imports the writer or the queue's mutating modules (see the
 * import gate).
 */
export type { AvailabilityContext, ActionTarget, SubjectRefusal } from './action-availability';
export { availabilityOf, SUBJECT_FREE } from './action-availability';
export {
  clearCommitReadMemo,
  listActiveDocumentOperations,
  readDocumentCommitView,
  type ActiveDocumentOperations,
  type CommitReadOptions,
} from './commit-reader';
export {
  deriveCommitView,
  emptyCommitView,
  markerOfJournal,
  type DocumentCommitMarker,
  type DocumentCommitView,
  type PathHold,
} from './commit-model';
export {
  DOCUMENT_RECOVERY_REQUIRED_CODE,
  DOCUMENT_ROW_PENDING_AFTER_MS,
  DOCUMENT_WRITE_INTERRUPTED_CODE,
  commitFailureCode,
  listDocumentOperationRows,
  type DocumentChangeListingRow,
} from './operation-rows';
export { readDocumentOperationStatus, type OperationStatusOptions } from './operation-status';
