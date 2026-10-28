/**
 * The pure document rules shared by the documents layer and the definitions loader: portable paths,
 * document ids, the overview protection rule, the document error and the verified file primitives.
 * This slice imports no other Specification slice, so
 * both can depend on it without a cycle.
 */
export { DocumentError } from './errors';
export {
  ancestorFolders,
  foldPathKey,
  validateDocumentPath,
  validateFolderPath,
} from './document-paths';
export {
  DERIVED_ID_PREFIX,
  DocumentIdError,
  allocateDocumentId,
  deriveUnclassifiedDocumentId,
  isRegisteredDocumentId,
} from './document-ids';
export {
  OVERVIEW_DOCUMENT_ID,
  OVERVIEW_DOCUMENT_PATH,
  OVERVIEW_DOCUMENT_TYPE,
  isProtectedDocument,
} from './protection';
