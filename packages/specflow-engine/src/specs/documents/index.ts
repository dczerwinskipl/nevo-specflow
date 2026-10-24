/**
 * Public entry of the Specification documents slice for the other slices (archetypes, create,
 * manifest model, scaffold): its pure primitives only - paths, ids, the overview protection rule,
 * the error and the limits it owns. Nothing here reads a file, so the entry stays free of the
 * archetype catalogue and the other slices can import it without a cycle. The filesystem readers
 * are exposed by `./reading`.
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
export { MANIFEST_MAX_BYTES, TEMPLATE_TEXT_MAX_BYTES, TEXT_CONTENT_MAX_BYTES } from './limits';
