import type { ManifestDocument } from '../model';

/**
 * What a registered document's file holds: `baseline`, only the initial content the Engine itself
 * wrote (from an archetype template, or generated, like a Task's `task.md` from its title and
 * summary), or `authored`, content a person or an agent changed or created.
 */
export type DocumentContentState = 'baseline' | 'authored';

/**
 * The content state of a registered document (Specification or Task registry, one rule for every
 * read that reports it): `baseline` while its file still has exactly the revision (sha256 of the
 * bytes) the entry's `baselineRevision` records, else `authored`. Every Engine write of generated
 * or template content records the revision of exactly the bytes it wrote in the same change, so a
 * system rewrite keeps the baseline; any other write changes the revision. Raw bytes are compared;
 * no catalogue is consulted.
 */
export function contentStateOf(
  entry: Pick<ManifestDocument, 'baselineRevision'>,
  revision: string,
): DocumentContentState {
  return entry.baselineRevision !== undefined && entry.baselineRevision === revision
    ? 'baseline'
    : 'authored';
}
