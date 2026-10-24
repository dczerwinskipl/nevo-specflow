import type { DocumentContent, DocumentTree } from '@nevo/specflow-contracts/documents';
import type { OpenedDocument } from '@nevo/specflow-engine';

/**
 * Read port of the documents feature. The Engine owns every document rule (paths, kinds, revisions,
 * limits, classification); an implementation returns its results or throws the Engine's typed errors,
 * and the routes only authorize, map errors to statuses and set headers.
 *
 * Only `read` is required: the demo source serves read-only demonstration content and has no tree or
 * raw bytes, so a route whose method is absent answers `SPEC_SOURCE_UNAVAILABLE`.
 */
export interface DocumentContentSource {
  /** One document as JSON. `revision` is the optional `?revision=` precondition. */
  read(specId: string, documentId: string, revision?: string): Promise<DocumentContent>;
  readTree?(specId: string): Promise<DocumentTree>;
  /** Raw bytes: metadata and a stream of exactly `metadata.size` bytes. The caller must consume or destroy the stream. */
  open?(specId: string, documentId: string): Promise<OpenedDocument>;
}
