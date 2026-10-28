import type { SpecificationManifest } from '../../../model';

/** A regular file of the Specification directory as the reader observed it (manifest excluded). */
export interface ObservedFile {
  /** Relative to the Specification directory, `/` separators. */
  readonly path: string;
  /** The revision a client holds: the sha256 for files up to the content-hash limit. */
  readonly revision: string;
  readonly sha256: string;
  /** UTF-8 / raw bytes. */
  readonly bytes: number;
}

/**
 * Everything a planner knows: the Specification's parsed manifest with its text, and the files on
 * disk. The planner reads nothing else and writes nothing; admission builds this from one manifest
 * read and one directory listing.
 */
export interface PlanningSnapshot {
  readonly manifest: SpecificationManifest;
  /** The manifest bytes as read: the pre-image, and the base the registry rewrite preserves. */
  readonly manifestText: string;
  readonly files: readonly ObservedFile[];
}

export interface PlanningOptions {
  /**
   * The folder revision of an existing folder (`sha256` over the sorted `path:revision` of the
   * files under it and their registry entries). Folder operations compare it with
   * `expectedRevision`.
   */
  readonly folderRevision?: (folderPath: string) => string;
  /**
   * The current catalogue revision. A create that uses a template must carry the same revision
   * (`CATALOGUE_STALE` otherwise). Not consulted by any other action.
   */
  readonly currentCatalogueRevision?: string;
}
