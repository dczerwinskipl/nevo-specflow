/**
 * Filesystem read side of the documents slice: the document tree, one document as JSON, the
 * registered document summaries and the raw stream. Kept apart from `./index` because the tree
 * reader depends on the archetype catalogue, which itself imports the pure primitives.
 */
export { readSpecificationDocument } from './document-reader';
export {
  openSpecificationDocument,
  type OpenedDocument,
  type OpenedDocumentMetadata,
} from './open';
export type { DocumentReadOptions } from './read-options';
export { readRegisteredDocumentSummaries, type RegisteredDocumentSummary } from './summaries';
export { readSpecificationDocumentTree } from './tree-reader';
