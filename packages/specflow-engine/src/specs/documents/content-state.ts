import type { ManifestDocument } from '../model';

/**
 * The content state of a registered document (Specification or Task registry): template only while
 * its file still has exactly the revision (sha256 of the bytes) the Engine created it with from an
 * archetype template, as the entry's `templateRevision` records it. One rule for every read that
 * reports it (the workspace summary, the document tree, the Task document listing). The comparison
 * is of raw bytes and consults no catalogue.
 */
export function isTemplateOnly(
  entry: Pick<ManifestDocument, 'templateRevision'>,
  revision: string,
): boolean {
  return entry.templateRevision !== undefined && entry.templateRevision === revision;
}
