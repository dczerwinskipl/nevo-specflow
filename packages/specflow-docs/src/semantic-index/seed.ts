// Seeding (ADR 0022 §3): a checkout without an index starts from a copy of Project Home's when both
// would build the same index, and MUST NOT copy otherwise. The identity is ADR 0021's index identity
// (chunker version, protocol, model, space, dimensions), the recorded probe and the fingerprint of
// the effective documentation settings. The copy goes through the destination's normal atomic
// writer under its lock and write admission; the incremental refresh that follows re-embeds only
// the chunks that differ. Hosts supply the source: this package never resolves Project Home.

import { join } from 'node:path';

import {
  CHUNKER_VERSION,
  PROBE_MIN_SIMILARITY,
  PROBE_TEXT,
  cosineSimilarity,
  createFileVectorStore,
  sameIdentity,
  type EmbeddingProvider,
  type IndexIdentity,
} from '@nevo/ai-semantic-search';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { CorpusSettings } from '../config/docs-file';
import { corpusSettingsFingerprint } from '../config/settings-fingerprint';
import { readCheckoutDocsSettings } from '../reader/settings';
import { readCache, writeCache } from './chunk-cache';
import type { EmbeddingProviders } from '../embeddings/embedding-providers';
import { providersFor, type SemanticEnvironment } from './environment';
import { DOCS_INDEX_DIRECTORY, vectorsDirectory, type DocsIndex } from './index-store';
import { semanticEndpoint } from './reasons';

/** The chunk cache file inside an index directory (`chunk-cache`). */
const CHUNK_CACHE_FILE = 'units.json';

/** The checkout whose index a missing index is seeded from: the Project Home. */
export interface SeedSource {
  /** Absolute checkout root; its index is `<checkoutRoot>/.nevo/local/cache/docs-index/`. */
  readonly checkoutRoot: string;
}

/** What the destination checkout would build its index with. */
export interface ConfiguredSeedIdentity {
  /**
   * The destination's effective documentation settings fingerprint, as `readCheckoutDocsSettings`
   * computes it (`docs.root`, `docs.yaml`, `docs.search.semantic`).
   */
  readonly settingsFingerprint: string;
  /**
   * The provider the destination embeds documents with. It embeds the probe once, and only when
   * everything else matches.
   */
  readonly provider: EmbeddingProvider;
}

export type SeedOutcome =
  | { readonly status: 'seeded'; readonly chunks: number; readonly generation: number }
  | {
      readonly status: 'not-seeded';
      /**
       * `memory-index`: the destination is held only in memory (tests) and has no directory to
       * seed; `index-present`: the destination has an index (or cannot be read); `no-source`: the
       * source has no readable index with a probe, or its settings cannot be read;
       * `settings-differ`, `identity-differs`: the identity does
       * not match (a failed probe counts as a mismatch); `not-written`: the lock was busy, the
       * write was refused or failed, or another writer created the index first.
       */
      readonly reason:
        | 'memory-index'
        | 'index-present'
        | 'no-source'
        | 'settings-differ'
        | 'identity-differs'
        | 'not-written';
    };

const notSeeded = (reason: Extract<SeedOutcome, { status: 'not-seeded' }>['reason']) =>
  ({ status: 'not-seeded', reason }) as const;

/**
 * Seed `dest` from the index of `source` when `dest` has no index and the source index is readable
 * (the highest complete generation pair, possibly of a build still running) with a probe and an
 * identical identity. The copy is one reset change of every source entry with its probe,
 * applied by `dest`'s writer (its lock taken without waiting, its write admission asked before the
 * change), then the source chunk cache, admitted again; the chunk cache is revalidated by content
 * hash on load anyway. Anything else copies nothing and the caller builds normally. Never seeds an
 * index held only in memory.
 */
export async function seedIndexIfMissing(
  dest: DocsIndex,
  source: SeedSource,
  configured: ConfiguredSeedIdentity,
): Promise<SeedOutcome> {
  if (dest.directory === undefined) {
    return notSeeded('memory-index');
  }

  if ((await dest.store.readManifest()).status !== 'missing') {
    return notSeeded('index-present');
  }

  const sourceFingerprint = sourceSettingsFingerprint(source.checkoutRoot);
  if (sourceFingerprint === undefined) {
    return notSeeded('no-source');
  }

  if (sourceFingerprint !== configured.settingsFingerprint) {
    return notSeeded('settings-differ');
  }

  const sourceDirectory = join(source.checkoutRoot, ...DOCS_INDEX_DIRECTORY.split('/'));
  const stored = await createFileVectorStore({
    directory: vectorsDirectory(sourceDirectory),
  }).readEntries();
  if (stored.status !== 'ok' || stored.manifest.probe === undefined) {
    return notSeeded('no-source');
  }

  const { identity, probe } = stored.manifest;
  if (!(await producesSameIndex(configured.provider, identity, probe))) {
    return notSeeded('identity-differs');
  }

  const opened = await dest.store.openWriter();
  if (opened.status !== 'opened') {
    return notSeeded('not-written');
  }

  try {
    // No base generation: an index another writer created meanwhile answers `conflict`.
    const applied = await opened.writer.apply({
      baseGeneration: undefined,
      identity,
      reset: true,
      upsert: stored.entries,
      delete: [],
      probe,
    });
    if (applied.status !== 'applied') {
      return notSeeded('not-written');
    }

    const units = await readCache(join(sourceDirectory, CHUNK_CACHE_FILE));
    if (units.size > 0 && (await dest.writes.check()) === undefined) {
      await writeCache(join(dest.directory, CHUNK_CACHE_FILE), units);
    }

    return { status: 'seeded', chunks: stored.entries.length, generation: applied.generation };
  } finally {
    await opened.writer.close();
  }
}

/**
 * The source checkout's settings fingerprint; `undefined` without documentation or when its
 * settings cannot be read for any reason: a seed never fails the command that asked for it.
 */
function sourceSettingsFingerprint(checkoutRoot: string): string | undefined {
  try {
    const settings = readCheckoutDocsSettings(checkoutRoot, { rejectLinks: true });

    return settings.status === 'configured' ? settings.fingerprint : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether `provider` builds vectors of `identity` with the same weights: the identity matches (the
 * dimension the probe observes when none is configured) and the fresh probe vector is as close to
 * the recorded one as ADR 0021 requires of a refresh.
 */
async function producesSameIndex(
  provider: EmbeddingProvider,
  identity: IndexIdentity,
  recordedProbe: Float32Array,
): Promise<boolean> {
  const configured = (dimensions: number): IndexIdentity => ({
    chunkerVersion: CHUNKER_VERSION,
    protocol: provider.protocol,
    model: provider.model,
    space: provider.space,
    dimensions,
  });
  if (!sameIdentity(configured(provider.dimensions ?? identity.dimensions), identity)) {
    return false;
  }

  const embedded = await provider.embed([PROBE_TEXT], 'document');
  if (!embedded.ok) {
    return false;
  }

  const probe = embedded.vectors[0]!;

  return (
    sameIdentity(configured(probe.length), identity) &&
    recordedProbe.length === probe.length &&
    cosineSimilarity(recordedProbe, probe) >= PROBE_MIN_SIMILARITY
  );
}

export interface ProjectSeed {
  /** Resolves the Project Home checkout root, or `undefined` when there is none to seed from. */
  readonly from: () => Promise<string | undefined>;
  readonly configuration: DocsConfiguration;
  /** The destination corpus settings (`DocsCorpus.settings`). */
  readonly corpusSettings: CorpusSettings;
  readonly environment: SemanticEnvironment;
  /**
   * Which configured provider embeds the probe: `query` (bounded by the query timeout) where a
   * seed must not hold a search up, `documents` for `semantic index`.
   */
  readonly provider: keyof EmbeddingProviders;
}

/**
 * `seedIndexIfMissing` for a command: only with semantic search enabled and an endpoint the
 * environment can reach (otherwise nothing would build the index either), and the source resolved
 * only once the destination index is missing.
 */
export async function seedProjectIndex(
  index: DocsIndex,
  { from, configuration, corpusSettings, environment, provider }: ProjectSeed,
): Promise<SeedOutcome | undefined> {
  const endpoint = semanticEndpoint(configuration);
  if ('reason' in endpoint || (await index.store.readManifest()).status !== 'missing') {
    return undefined;
  }

  const resolved = providersFor(endpoint.embeddings, environment);
  if ('reason' in resolved) {
    return undefined;
  }

  const checkoutRoot = await from();
  if (checkoutRoot === undefined) {
    return undefined;
  }

  return seedIndexIfMissing(
    index,
    { checkoutRoot },
    {
      settingsFingerprint: corpusSettingsFingerprint(
        corpusSettings,
        configuration.docs.search.semantic,
      ),
      provider: resolved.providers[provider],
    },
  );
}
