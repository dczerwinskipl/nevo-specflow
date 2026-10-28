import { sha256Hex } from '../../../hash';
import type { SpecificationManifest } from '../../model';
import type { ObservedFile } from '../changes/plan/snapshot';

/**
 * The revision of a folder: sha256 over the sorted lines
 * `file:<path>:<revision>` of every file under it, `entry:<path>:<id>:<type>` of every registry entry
 * under it and `folder:<path>` of every explicit folder at or under it (all paths relative to the
 * Specification directory). Commit state is not part of it, so a pending commit never changes the
 * revision a client holds. The one definition: the document tree reports the same value.
 */
export function folderRevisionOf(
  folder: string,
  files: readonly Pick<ObservedFile, 'path' | 'revision'>[],
  manifest: Pick<SpecificationManifest, 'documents' | 'folders'>,
): string {
  const prefix = folder + '/';
  const lines = [
    ...files
      .filter((file) => file.path.startsWith(prefix))
      .map((file) => `file:${file.path}:${file.revision}`),
    ...manifest.documents
      .filter((entry) => entry.path.startsWith(prefix))
      .map((entry) => `entry:${entry.path}:${entry.id}:${entry.type}`),
    ...manifest.folders
      .filter((explicit) => explicit === folder || explicit.startsWith(prefix))
      .map((explicit) => `folder:${explicit}`),
  ].sort();
  return sha256Hex(lines.join('\n'));
}
