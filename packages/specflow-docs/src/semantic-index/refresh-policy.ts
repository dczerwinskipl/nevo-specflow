// The read-time refresh (ADR 0020): how much of the index a search brings up to date before it
// answers. `semantic status` reports `index-building` with the same bound.

import {
  refreshIndex,
  type EmbeddingFailure,
  type EmbeddingProvider,
  type VectorStore,
} from '@nevo/ai-semantic-search';
import type { DocsIndexActivity, DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { EmbeddingProviders } from '../embeddings/embedding-providers';
import { embeddingFailureReason, isBusyFailure } from '../embeddings/endpoint-reasons';
import type { IndexCatchUp } from './catch-up';
import type { DocsChunk } from './chunk-source';
import { pendingChunks } from './freshness';
import {
  busyEndpointReason,
  catchUpReason,
  deadlineReason,
  identityChangedReason,
  overLimitReason,
  refreshReason,
  refreshSkippedReason,
  unreadableIndexReason,
} from './reasons';
import type { IndexWrites } from './write-admission';

/**
 * Most chunks a search embeds before answering (the read-time refresh). It is one request at the
 * default batch size, about 10 s on a local CPU model and far less on a hosted API, and covers a
 * typical edit of a few sections. A larger gap (a first build: about 20 minutes on CPU for this
 * repository) is left to the background catch-up, `semantic index` or the Runtime start refresh.
 */
export const READ_REFRESH_MAX_CHUNKS = 16;

/** The index a search ranks with, and the providers that embed the query and refresh it. */
export interface IndexVectors {
  /** Takes its writer and applies each change only once `writes` admits it (`DocsIndex.store`). */
  readonly store: VectorStore;
  /** The index's write admission, asked before a catch-up is started too. */
  readonly writes: IndexWrites;
  readonly providers: EmbeddingProviders;
  /**
   * The document provider of `providers` with its requests also aborted by `signal`: the read-time
   * refresh of a search with an answer budget embeds through it, so its deadline stops the requests
   * instead of leaving them to run (`EmbeddingProviders` from `createEmbeddingProviders`).
   */
  readonly documentsAbortedBy: (signal: AbortSignal) => EmbeddingProvider;
  /**
   * Runs a full refresh in the background for a gap above `READ_REFRESH_MAX_CHUNKS`. Absent: the
   * `index-building` reason asks for `semantic index` instead.
   */
  readonly catchUp?: IndexCatchUp;
  /**
   * Who writes the index now (`readIndexActivity`), asked only after an endpoint failure, so a
   * failure while a live writer updates the index reports `index-building`. Absent for an index held
   * only in memory.
   */
  readonly activity?: () => Promise<DocsIndexActivity>;
}

/**
 * The reason for an endpoint failure of a search: `index-building` (`busyEndpointReason`) when it
 * timed out or was refused while a live writer updates the index, otherwise `endpoint-unreachable`.
 */
export async function endpointFailureReason(
  vectors: IndexVectors,
  failure: EmbeddingFailure,
): Promise<DocsSearchReason> {
  if (isBusyFailure(failure) && vectors.activity !== undefined) {
    const activity = await vectors.activity();
    if (activity.state === 'updating') {
      return busyEndpointReason(failure, activity.progress);
    }
  }

  return embeddingFailureReason(failure);
}

/**
 * Hybrid ranking needs a vector for every current chunk (ADR 0020: an index that is not complete
 * for the current data answers lexically with `index-building`). The manifest is checked first, so
 * a complete index costs no endpoint call here. Otherwise a small gap is embedded before answering,
 * after a short probe (an unreachable endpoint answers lexically after at most the query timeout);
 * a gap above `READ_REFRESH_MAX_CHUNKS`, or any gap with `refresh` off, is not embedded. A larger
 * gap with `refresh` on has the catch-up run (when the host supplies one): a refresh that already
 * runs is only described, otherwise one is started after the probe succeeds.
 *
 * With a `deadline` (a search's answer budget, `DocsSearchRequest.answerBudgetMs`), the small gap is
 * embedded only until it aborts: the document requests are aborted through it, the refresh is awaited
 * until it has settled (it releases the writer; a bounded refresh writes its one slice only after
 * embedding it, so an aborted one has written nothing) and the gap is handed to the catch-up without
 * another probe, answering `index-building`. The abort is recognised by `deadline.aborted`, never by
 * the failure, so it is never reported as `endpoint-unreachable`.
 */
export async function refreshForRead(
  vectors: IndexVectors,
  chunks: readonly DocsChunk[],
  refresh: boolean,
  indexCommand: string,
  deadline?: AbortSignal,
): Promise<DocsSearchReason | undefined> {
  const { store, providers } = vectors;
  const manifest = await store.readManifest();
  if (manifest.status === 'unreadable') {
    return unreadableIndexReason(manifest.message);
  }

  // Vectors of deleted chunks are never ranked (the engine matches chunk ids and hashes), so an
  // index with only extra vectors is complete; the next full refresh drops them.
  const missing = pendingChunks(
    chunks,
    providers.documents,
    manifest.status === 'ok' ? manifest.manifest : undefined,
  );
  if (missing === 0) {
    return undefined;
  }

  if (!refresh) {
    return refreshSkippedReason(missing, chunks.length, indexCommand);
  }

  if (missing > READ_REFRESH_MAX_CHUNKS) {
    return largeGapReason(vectors, missing, indexCommand);
  }

  const probe = await providers.query.probe();
  if (!probe.ok) {
    return endpointFailureReason(vectors, probe.failure);
  }

  if (deadline?.aborted) {
    return deadlineGapReason(vectors, missing, indexCommand);
  }

  // The bound holds under the lock too: a re-probe that observes another dimension, or a manifest
  // gone since the read above, turns this into a full rebuild, which the search must not run.
  // Awaited also once the deadline has aborted it, so its writer is closed before the answer.
  const outcome = await refreshIndex({
    chunks,
    provider: deadline === undefined ? providers.documents : vectors.documentsAbortedBy(deadline),
    store,
    maxEmbed: READ_REFRESH_MAX_CHUNKS,
  });
  if (outcome.status === 'embedding-failed' && deadline?.aborted) {
    return deadlineGapReason(vectors, missing, indexCommand);
  }

  if (outcome.status === 'write-failed') {
    return vectors.writes.refusal() ?? refreshReason(outcome);
  }

  return outcome.status === 'over-limit'
    ? largeGapReason(vectors, outcome.pending, indexCommand)
    : refreshReason(outcome);
}

/**
 * The engine found that the query vector does not fit the stored index (`mismatch`) although the
 * content check of `refreshForRead` found it complete. That check compares content only and costs
 * no endpoint call, so an endpoint that changed its dimension under the same model name (without
 * configured dimensions) shows up only here, through the query vector. The rebuild is never run by
 * the search: with `refresh` on the catch-up runs it (without a probe: the endpoint has just
 * embedded the query), otherwise, or without a catch-up, the reason names `semantic index`, which
 * probes the endpoint and rebuilds.
 */
export async function identityChangedForRead(
  { catchUp, writes }: IndexVectors,
  mismatch: string,
  total: number,
  refresh: boolean,
  indexCommand: string,
): Promise<DocsSearchReason> {
  if (!refresh || catchUp === undefined) {
    return identityChangedReason(mismatch, total, `run \`${indexCommand}\``);
  }

  const running = await catchUp.running();
  if (running !== undefined) {
    return identityChangedReason(mismatch, total, running);
  }

  return (await writes.check()) ?? identityChangedReason(mismatch, total, await catchUp.start());
}

/** A gap the search does not embed: caught up in the background, or left to `semantic index`. */
async function largeGapReason(
  vectors: IndexVectors,
  missing: number,
  indexCommand: string,
): Promise<DocsSearchReason> {
  if (vectors.catchUp === undefined) {
    return overLimitReason(missing, READ_REFRESH_MAX_CHUNKS, indexCommand);
  }

  return caughtUp(vectors, vectors.catchUp, 'probe', (clause) =>
    catchUpReason(missing, READ_REFRESH_MAX_CHUNKS, clause),
  );
}

/**
 * A small gap the read-time refresh did not embed before its deadline: caught up like a large gap,
 * but without a probe, since the endpoint has just answered one.
 */
async function deadlineGapReason(
  vectors: IndexVectors,
  missing: number,
  indexCommand: string,
): Promise<DocsSearchReason> {
  if (vectors.catchUp === undefined) {
    return deadlineReason(missing, `run \`${indexCommand}\``);
  }

  return caughtUp(vectors, vectors.catchUp, 'probed', (clause) => deadlineReason(missing, clause));
}

/**
 * The catch-up's running refresh, or one started now (`probe`: after a probe, which a catch-up
 * against an unreachable endpoint would only fail), described by `describe`.
 */
async function caughtUp(
  { providers, writes }: IndexVectors,
  catchUp: IndexCatchUp,
  endpoint: 'probe' | 'probed',
  describe: (clause: string) => DocsSearchReason,
): Promise<DocsSearchReason> {
  const running = await catchUp.running();
  if (running !== undefined) {
    return describe(running);
  }

  if (endpoint === 'probe') {
    const probe = await providers.query.probe();
    if (!probe.ok) {
      return embeddingFailureReason(probe.failure);
    }
  }

  // Starting it writes the index directory (the CLI's marker and log).
  const refusal = await writes.check();
  if (refusal !== undefined) {
    return refusal;
  }

  return describe(await catchUp.start());
}
