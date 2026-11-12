import type { ManifestDocument, SpecificationLocation } from '../../../model';
import type { DocumentContainer } from './container';

/** A regular file of the container root as the reader observed it (registry file excluded). */
export interface ObservedFile {
  /** Relative to the container root, `/` separators. */
  readonly path: string;
  /** The revision a client holds: the sha256 for files up to the content-hash limit. */
  readonly revision: string;
  readonly sha256: string;
  /** UTF-8 / raw bytes. */
  readonly bytes: number;
}

/**
 * What a planner knows of the container's registry file (`specification.yaml` or a Task's
 * `task.yaml`): the Specification it belongs to and the registry. A Task has no explicit folders.
 */
export interface RegistryManifest {
  readonly specId: string;
  readonly slug: string;
  readonly location: SpecificationLocation;
  readonly documents: readonly ManifestDocument[];
  readonly folders: readonly string[];
}

/**
 * Everything a planner knows: the container, its parsed registry file with its text, and the files
 * on disk. The planner reads nothing else and writes nothing; admission builds this from one
 * registry read and one directory listing.
 */
export interface PlanningSnapshot {
  readonly container: DocumentContainer;
  readonly manifest: RegistryManifest;
  /** The registry file bytes as read: the pre-image, and the base the registry rewrite preserves. */
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
