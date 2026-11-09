import { CHUNKER_VERSION } from './markdown-chunker';
import type {
  Chunk,
  EmbeddingFailure,
  EmbeddingProvider,
  IndexIdentity,
  IndexManifest,
  ManifestOutcome,
  StoreUnreadable,
  VectorStore,
} from './ports';
import { sameIdentity } from './vector-store-contract';

/** What a refresh changes: `reset` replaces the whole index (no index yet or another identity). */
export interface RefreshPlan {
  readonly reset: boolean;
  /** New or changed chunks; with `reset`, every chunk. */
  readonly embed: readonly Chunk[];
  /** Stored chunk ids that no longer exist; empty with `reset`. */
  readonly delete: readonly string[];
}

export interface RefreshRequest {
  /** Every current chunk of the corpus, for example `chunkMarkdownUnit` over each unit. */
  readonly chunks: readonly Chunk[];
  readonly provider: EmbeddingProvider;
  readonly store: VectorStore;
}

/**
 * - `current`: the index already matches the chunks; nothing was embedded or written.
 * - `refreshed`: the plan was embedded and applied (`rebuilt` for a full rebuild).
 * - `busy`: another writer holds or changed the index; nothing was embedded or written.
 * - `embedding-failed`: the provider failed; the index is unchanged.
 * - `unreadable`: the index cannot be read right now; nothing was written.
 */
export type RefreshOutcome =
  | { readonly status: 'current'; readonly generation: number }
  | {
      readonly status: 'refreshed';
      readonly generation: number;
      readonly rebuilt: boolean;
      readonly embedded: number;
      readonly deleted: number;
    }
  | { readonly status: 'busy'; readonly message: string }
  | { readonly status: 'embedding-failed'; readonly failure: EmbeddingFailure }
  | StoreUnreadable;

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

/**
 * Brings the store up to date with the chunks. The plan is first computed without the lock, so an
 * up-to-date index costs one manifest read; otherwise the refresh opens the single writer (a held
 * lock answers `busy` without waiting), re-reads the manifest, embeds only the planned chunks in one
 * provider call and applies them with the manifest generation it read as the compare-and-swap base.
 * A provider without configured dimensions is probed for them. Write failures are thrown.
 */
export async function refreshIndex(request: RefreshRequest): Promise<RefreshOutcome> {
  const { chunks, provider, store } = request;

  let dimensions = provider.dimensions;
  if (dimensions === undefined) {
    const probe = await provider.probe();
    if (!probe.ok) {
      return { status: 'embedding-failed', failure: probe.failure };
    }

    dimensions = probe.dimensions;
  }

  const identity: IndexIdentity = {
    chunkerVersion: CHUNKER_VERSION,
    protocol: provider.protocol,
    model: provider.model,
    dimensions,
  };

  const unlocked = await store.readManifest();
  if (unlocked.status === 'unreadable') {
    return unlocked;
  }

  const unlockedManifest = manifestOf(unlocked);
  if (unlockedManifest && isCurrent(planRefresh(chunks, identity, unlockedManifest))) {
    return { status: 'current', generation: unlockedManifest.generation };
  }

  const opened = await store.openWriter();
  if (opened.status === 'busy') {
    return opened;
  }

  try {
    const locked = await store.readManifest();
    if (locked.status === 'unreadable') {
      return locked;
    }

    const manifest = manifestOf(locked);
    const plan = planRefresh(chunks, identity, manifest);
    if (manifest && isCurrent(plan)) {
      return { status: 'current', generation: manifest.generation };
    }

    let vectors: readonly Float32Array[] = [];
    if (plan.embed.length > 0) {
      const embedded = await provider.embed(
        plan.embed.map((chunk) => chunk.embeddingText),
        'document',
      );
      if (!embedded.ok) {
        return { status: 'embedding-failed', failure: embedded.failure };
      }

      vectors = embedded.vectors;
    }

    const outcome = await opened.writer.apply({
      baseGeneration: manifest?.generation,
      identity,
      reset: plan.reset,
      upsert: plan.embed.map((chunk, index) => ({
        chunkId: chunk.id,
        contentHash: chunk.contentHash,
        vector: vectors[index]!,
      })),
      delete: plan.delete,
    });

    // Under the lock only a writer that broke the lock protocol can have moved the store on.
    if (outcome.status === 'conflict') {
      return { status: 'busy', message: 'Another writer changed the index during the refresh.' };
    }

    return {
      status: 'refreshed',
      generation: outcome.generation,
      rebuilt: plan.reset,
      embedded: plan.embed.length,
      deleted: plan.delete.length,
    };
  } finally {
    await opened.writer.close();
  }
}

function manifestOf(outcome: Exclude<ManifestOutcome, StoreUnreadable>): IndexManifest | undefined {
  return outcome.status === 'ok' ? outcome.manifest : undefined;
}

function isCurrent(plan: RefreshPlan): boolean {
  return !plan.reset && plan.embed.length === 0 && plan.delete.length === 0;
}
