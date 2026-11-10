import type { Chunk } from '../../chunking/chunk';
import { CHUNKER_VERSION } from '../../chunking/markdown-chunker';
import type { EmbeddingFailure, EmbeddingProvider } from '../../embeddings/embedding-provider';
import {
  type IndexIdentity,
  type IndexManifest,
  type ManifestOutcome,
  type StoreUnreadable,
  type StoreWriteFailed,
  type VectorStore,
} from '../vector-store/vector-store';
import { planRefresh, type RefreshPlan } from './plan-refresh';

/**
 * Chunks embedded per store write. A long refresh (a first build on a CPU model takes many minutes)
 * lands in several writes, so an interruption or a failed request loses at most one slice.
 */
export const REFRESH_COMMIT_CHUNKS = 128;

/**
 * Reported by a refresh that embeds: once with `embedded: 0` when the plan is made under the lock,
 * then after every store write.
 */
export interface RefreshProgress {
  readonly embedded: number;
  readonly total: number;
}

export interface RefreshRequest {
  /** Every current chunk of the corpus, for example `chunkMarkdownUnit` over each unit. */
  readonly chunks: readonly Chunk[];
  readonly provider: EmbeddingProvider;
  readonly store: VectorStore;
  /** Chunks per store write; defaults to `REFRESH_COMMIT_CHUNKS`. */
  readonly commitChunks?: number;
  /**
   * Most chunks this refresh may embed, checked against the plan made under the lock; a larger plan
   * answers `over-limit` without embedding. Unbounded when omitted.
   */
  readonly maxEmbed?: number;
  readonly onProgress?: (progress: RefreshProgress) => void;
}

/**
 * - `current`: the index already matches the chunks; nothing was embedded or written.
 * - `refreshed`: the plan was embedded and applied (`rebuilt` for a full rebuild).
 * - `over-limit`: the plan embeds `pending` chunks, more than `maxEmbed`; nothing was embedded or
 *   written.
 * - `busy`: another writer holds or changed the index; nothing more was embedded or written.
 * - `embedding-failed`: the provider failed; slices written before the failure stay applied and
 *   the next refresh embeds only the rest.
 * - `unreadable`: the index cannot be read right now; nothing was written.
 * - `write-failed`: the lock or the index could not be written; earlier slices stay applied.
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
  | { readonly status: 'over-limit'; readonly pending: number }
  | { readonly status: 'busy'; readonly message: string }
  | { readonly status: 'embedding-failed'; readonly failure: EmbeddingFailure }
  | StoreUnreadable
  | StoreWriteFailed;

/**
 * Brings the store up to date with the chunks. The embedding identity is resolved first: the
 * configured dimensions, or else the dimension a probe observes, so an endpoint that changed its
 * dimension under the same model name is rebuilt rather than reported current (a cheap freshness
 * check that must not call the endpoint compares content only, for example `planRefresh` against
 * the stored identity). The plan is then computed without the lock, so an up-to-date index costs
 * one manifest read. Otherwise the refresh opens the single writer (a held lock answers `busy`
 * without waiting), re-reads the manifest, checks the plan against `maxEmbed` and embeds only the
 * planned chunks, in slices of `commitChunks` (reporting `onProgress` before the first and after
 * each): each slice is applied as soon as it is embedded, with the generation of the previous write
 * as the compare-and-swap base (the first write carries the deletes and, for a rebuild, the reset).
 * Only a contract violation throws.
 */
export async function refreshIndex(request: RefreshRequest): Promise<RefreshOutcome> {
  const { chunks, provider, store, onProgress } = request;
  const commitChunks = request.commitChunks ?? REFRESH_COMMIT_CHUNKS;
  if (!Number.isInteger(commitChunks) || commitChunks < 1) {
    throw new RangeError(`commitChunks must be a positive integer, got ${commitChunks}.`);
  }

  const { maxEmbed } = request;
  if (maxEmbed !== undefined && (!Number.isInteger(maxEmbed) || maxEmbed < 0)) {
    throw new RangeError(`maxEmbed must be a non-negative integer, got ${maxEmbed}.`);
  }

  const unlocked = await store.readManifest();
  if (unlocked.status === 'unreadable') {
    return unlocked;
  }

  // The endpoint's real dimension before the plan: a provider without configured dimensions can change it
  // under the same model name, and an index of the old dimension is then not current at all.
  let dimensions = provider.dimensions;
  if (dimensions === undefined) {
    const probe = await provider.probe();
    if (!probe.ok) {
      return { status: 'embedding-failed', failure: probe.failure };
    }

    dimensions = probe.dimensions;
  }

  const identity = identityFor(provider, dimensions);
  const unlockedManifest = manifestOf(unlocked);
  if (unlockedManifest && isCurrent(planRefresh(chunks, identity, unlockedManifest))) {
    return { status: 'current', generation: unlockedManifest.generation };
  }

  const opened = await store.openWriter();
  if (opened.status !== 'opened') {
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

    if (maxEmbed !== undefined && plan.embed.length > maxEmbed) {
      return { status: 'over-limit', pending: plan.embed.length };
    }

    const total = plan.embed.length;
    if (total > 0) {
      onProgress?.({ embedded: 0, total });
    }

    let generation = manifest?.generation;
    // At least one write, so a rebuild of an empty corpus or a delete-only plan lands too.
    for (let start = 0; start === 0 || start < total; start += commitChunks) {
      const slice = plan.embed.slice(start, start + commitChunks);
      let vectors: readonly Float32Array[] = [];
      if (slice.length > 0) {
        const embedded = await provider.embed(
          slice.map((chunk) => chunk.embeddingText),
          'document',
        );
        if (!embedded.ok) {
          return { status: 'embedding-failed', failure: embedded.failure };
        }

        // The provider checks dimensions within one call; slices are separate calls.
        const wrong = embedded.vectors.find((vector) => vector.length !== dimensions);
        if (wrong) {
          return {
            status: 'embedding-failed',
            failure: {
              code: 'dimension-mismatch',
              message: `The provider returned ${wrong.length}-dimensional vectors; the index has ${dimensions}.`,
            },
          };
        }

        vectors = embedded.vectors;
      }

      const first = start === 0;
      const outcome = await opened.writer.apply({
        baseGeneration: generation,
        identity,
        reset: first && plan.reset,
        upsert: slice.map((chunk, index) => ({
          chunkId: chunk.id,
          contentHash: chunk.contentHash,
          vector: vectors[index]!,
        })),
        delete: first ? plan.delete : [],
      });

      // Under the lock only a writer that broke the lock protocol can have moved the store on.
      if (outcome.status === 'conflict') {
        return { status: 'busy', message: 'Another writer changed the index during the refresh.' };
      }

      if (outcome.status === 'write-failed') {
        return outcome;
      }

      generation = outcome.generation;
      if (total > 0) {
        onProgress?.({ embedded: start + slice.length, total });
      }
    }

    return {
      status: 'refreshed',
      generation: generation!,
      rebuilt: plan.reset,
      embedded: plan.embed.length,
      deleted: plan.delete.length,
    };
  } finally {
    await opened.writer.close();
  }
}

function identityFor(provider: EmbeddingProvider, dimensions: number): IndexIdentity {
  return {
    chunkerVersion: CHUNKER_VERSION,
    protocol: provider.protocol,
    model: provider.model,
    dimensions,
  };
}

function manifestOf(outcome: Exclude<ManifestOutcome, StoreUnreadable>): IndexManifest | undefined {
  return outcome.status === 'ok' ? outcome.manifest : undefined;
}

function isCurrent(plan: RefreshPlan): boolean {
  return !plan.reset && plan.embed.length === 0 && plan.delete.length === 0;
}
