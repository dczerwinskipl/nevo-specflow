import type { Chunk } from '../../chunking/chunk';
import { sameIdentity, type IndexIdentity, type IndexManifest } from '../vector-store/vector-store';

/** What a refresh changes: `reset` replaces the whole index (no index yet or another identity). */
export interface RefreshPlan {
  readonly reset: boolean;
  /** New or changed chunks; with `reset`, every chunk. */
  readonly embed: readonly Chunk[];
  /** Stored chunk ids that no longer exist; empty with `reset`. */
  readonly delete: readonly string[];
}

/**
 * Diffs the current chunks against a manifest. No manifest or another identity means a full
 * rebuild; otherwise only chunks whose id is new or whose content hash changed are embedded, and
 * stored chunks that no longer exist are deleted.
 */
export function planRefresh(
  chunks: readonly Chunk[],
  identity: IndexIdentity,
  manifest: IndexManifest | undefined,
): RefreshPlan {
  const ids = new Set<string>();
  for (const chunk of chunks) {
    if (ids.has(chunk.id)) {
      throw new Error(`Duplicate chunk id: ${chunk.id}`);
    }

    ids.add(chunk.id);
  }

  if (!manifest || !sameIdentity(manifest.identity, identity)) {
    return { reset: true, embed: chunks, delete: [] };
  }

  return {
    reset: false,
    embed: chunks.filter((chunk) => manifest.chunks.get(chunk.id) !== chunk.contentHash),
    delete: [...manifest.chunks.keys()].filter((id) => !ids.has(id)),
  };
}
