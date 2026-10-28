import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { DocumentError } from '../document-rules/errors';

import type { DefinitionKindRegistry } from './kind-registry';
import { createDefaultDefinitionRegistry } from './kinds';
import {
  CATALOGUE_LOAD_ATTEMPTS,
  CATALOGUE_MEMO_MAX_HOMES,
  CATALOGUE_RECENCY_WINDOW_MS,
  CATALOGUE_STABLE_READ_ATTEMPTS,
  CATALOGUE_STABLE_READ_DELAY_MS,
} from './limits';
import { loadDefinitions, type LoadResult } from './loader';
import { resolveProjectCatalogue, type ProjectCatalogue } from './project-catalogue';
import { SPECIFICATION_ARCHETYPE_KIND } from './kinds/specification-archetype';
import { computeStatSignature, statKey, type StatSignature } from './signature';
import {
  DEFINITIONS_RELATIVE_PATH,
  createFilesystemDefinitionSource,
  type DefinitionSource,
} from './source';

/**
 * The project catalogue with its stat memo (architecture "Definitions as project data", "Caching").
 *
 * - One memo entry per Project Home, revalidated on EVERY call by the stat signature of the definitions
 *   tree. No file watcher, no lock, no Git.
 * - A cached catalogue is trusted only when it was loaded at least 2 seconds after the newest change of
 *   any entry (the same recency rule as the document revision memo): a rewrite within the timestamp
 *   granularity of a file just loaded could otherwise go unnoticed.
 * - A load whose signature differs before and after it ran is retried, 3 attempts in all; then the last
 *   good catalogue is served flagged `unstableRead` (or, with none, the last load, not cached).
 */

export interface ProjectCatalogueResult extends ProjectCatalogue {
  /** True when the files kept changing during the load and the result may be out of date. */
  readonly unstableRead: boolean;
}

/** What the tree reader needs of one archetype: no walk of the definitions folder per request. */
export interface ArchetypeLookup {
  /** `invalid`: a file exists but is not in the catalogue; `absent`: no file. */
  readonly state: 'defined' | 'invalid' | 'absent';
  readonly title?: string;
}

export interface ProjectHomeLike {
  readonly context: { readonly project: { readonly homeRoot: string } };
}

export interface CatalogueSource {
  get(homeRoot: string): Promise<ProjectCatalogueResult>;
  lookupArchetype(homeRoot: string, id: string): Promise<ArchetypeLookup>;
  clear(): void;
}

export interface CatalogueSourceOptions {
  /** The registered kinds. Default: the kinds the product ships. */
  readonly registry?: DefinitionKindRegistry;
  /** The definitions tree of one Project Home. Default: the filesystem below `.nevo/definitions`. */
  readonly sourceFor?: (homeRoot: string) => DefinitionSource;
  /** Wall clock in milliseconds. */
  readonly nowMs?: () => number;
}

/** The stat key of a file a definition depends on; a file that is not there has its own marker. */
const ABSENT_KEY = 'absent';

interface MemoEntry {
  readonly signature: string;
  readonly trusted: boolean;
  readonly result: ProjectCatalogue;
  /**
   * Per archetype id: the stat key of every file its state depends on (its own file, its template
   * files and the document type files it refers to), as they were when the catalogue was loaded. A
   * single-archetype lookup trusts the memo only while all of them are unchanged.
   */
  readonly archetypeDependencies: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

function archetypeDependenciesOf(
  loaded: LoadResult,
  signature: StatSignature,
): Map<string, Map<string, string>> {
  const prefix = `${SPECIFICATION_ARCHETYPE_KIND}/`;
  const result = new Map<string, Map<string, string>>();
  for (const [key, paths] of loaded.dependencies) {
    if (!key.startsWith(prefix)) continue;
    const keys = new Map<string, string>();
    for (const path of paths) keys.set(path, signature.fileKeys.get(path) ?? ABSENT_KEY);
    result.set(key.slice(prefix.length), keys);
  }
  return result;
}

function filesystemSourceFor(homeRoot: string): DefinitionSource {
  return createFilesystemDefinitionSource(join(homeRoot, ...DEFINITIONS_RELATIVE_PATH.split('/')));
}

export function createCatalogueSource(options: CatalogueSourceOptions = {}): CatalogueSource {
  const sourceFor = options.sourceFor ?? filesystemSourceFor;
  const nowMs = options.nowMs ?? Date.now;
  const registry = options.registry ?? createDefaultDefinitionRegistry();
  const memo = new Map<string, MemoEntry>();

  const remember = (homeRoot: string, entry: MemoEntry): void => {
    memo.delete(homeRoot);
    memo.set(homeRoot, entry);
    while (memo.size > CATALOGUE_MEMO_MAX_HOMES) {
      const oldest = memo.keys().next();
      if (oldest.done) break;
      memo.delete(oldest.value);
    }
  };

  async function get(homeRoot: string): Promise<ProjectCatalogueResult> {
    const source = sourceFor(homeRoot);
    let lastLoad: ProjectCatalogue | undefined;

    for (let attempt = 1; attempt <= CATALOGUE_LOAD_ATTEMPTS; attempt += 1) {
      const startedAtMs = nowMs();
      const before = await computeStatSignature(source);
      if (attempt === 1) {
        const cached = memo.get(homeRoot);
        if (cached?.trusted && cached.signature === before.value && before.complete) {
          remember(homeRoot, cached);
          return { ...cached.result, unstableRead: false };
        }
      }
      const loaded = await loadDefinitions(source, registry);
      const result = resolveProjectCatalogue(loaded);
      const after = await computeStatSignature(source);
      lastLoad = result;
      if (after.value !== before.value) continue;
      remember(homeRoot, {
        signature: after.value,
        trusted:
          after.complete && after.newestChangeMs + CATALOGUE_RECENCY_WINDOW_MS <= startedAtMs,
        result,
        archetypeDependencies: archetypeDependenciesOf(loaded, after),
      });
      return { ...result, unstableRead: false };
    }

    const lastGood = memo.get(homeRoot);
    if (lastGood) return { ...lastGood.result, unstableRead: true };
    if (!lastLoad) throw new Error('The catalogue could not be loaded.');
    return { ...lastLoad, unstableRead: true };
  }

  /** The current stat key of one file, in the vocabulary of the memo. */
  async function currentKey(source: DefinitionSource, path: string): Promise<string> {
    const stat = await source.stat(path);
    if (stat.state === 'ok') return statKey(stat.entry);
    return stat.state === 'absent' ? ABSENT_KEY : stat.state;
  }

  /** True when every file the memo recorded for the archetype still has the recorded stat key. */
  async function dependenciesUnchanged(
    source: DefinitionSource,
    recorded: ReadonlyMap<string, string>,
  ): Promise<boolean> {
    for (const [path, key] of recorded) {
      if ((await currentKey(source, path)) !== key) return false;
    }
    return true;
  }

  async function lookupArchetype(homeRoot: string, id: string): Promise<ArchetypeLookup> {
    const source = sourceFor(homeRoot);
    const path = `${SPECIFICATION_ARCHETYPE_KIND}/${id}.yaml`;
    const stat = await source.stat(path);
    if (stat.state === 'absent') return { state: 'absent' };
    if (stat.state !== 'ok') return { state: 'invalid' };
    // The memo answers only while the archetype file AND every file its validity depends on (its
    // templates, the document types it refers to) are exactly as they were loaded; a broken or repaired
    // dependency therefore shows at the next lookup, not at some later full read.
    const cached = memo.get(homeRoot);
    const recorded = cached?.trusted === true ? cached.archetypeDependencies.get(id) : undefined;
    const known =
      cached !== undefined &&
      recorded?.get(path) === statKey(stat.entry) &&
      (await dependenciesUnchanged(source, recorded));
    const result = known ? cached.result : await get(homeRoot);
    const archetype = result.catalogue.findArchetype(id);
    return archetype ? { state: 'defined', title: archetype.title } : { state: 'invalid' };
  }

  return { get, lookupArchetype, clear: () => memo.clear() };
}

let processCatalogueSource: CatalogueSource | undefined;

/** The per-process catalogue source used by the Engine entry points. */
export function defaultCatalogueSource(): CatalogueSource {
  processCatalogueSource ??= createCatalogueSource();
  return processCatalogueSource;
}

/** The catalogue of the Project Home of an Engine (stat-on-read, see {@link createCatalogueSource}). */
export function getProjectCatalogue(engine: ProjectHomeLike): Promise<ProjectCatalogueResult> {
  return defaultCatalogueSource().get(engine.context.project.homeRoot);
}

/** The state of one archetype definition of an Engine's Project Home: one `lstat` plus the memo. */
export function lookupProjectArchetype(
  engine: ProjectHomeLike,
  archetypeId: string,
): Promise<ArchetypeLookup> {
  return defaultCatalogueSource().lookupArchetype(engine.context.project.homeRoot, archetypeId);
}

export interface StableReadOptions {
  /** Loads in all before giving up (default 3). */
  readonly attempts?: number;
  readonly delayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * The project catalogue for a mutation (Create admission and scaffold): a catalogue the source could
 * only serve flagged `unstableRead` (the files kept changing under three loads) is loaded again after
 * a short pause, and when it still does not settle the operation is refused with `CATALOGUE_STALE`
 * (`cause: catalogue-unstable`, retryable) instead of pinning a torn read into a journal.
 */
export async function loadStableProjectCatalogue(
  source: CatalogueSource,
  homeRoot: string,
  options: StableReadOptions = {},
): Promise<ProjectCatalogueResult> {
  const attempts = options.attempts ?? CATALOGUE_STABLE_READ_ATTEMPTS;
  const pause = options.sleep ?? ((ms: number) => sleep(ms));
  for (let attempt = 1; ; attempt += 1) {
    const result = await source.get(homeRoot);
    if (!result.unstableRead) return result;
    if (attempt >= attempts) {
      throw new DocumentError(
        'CATALOGUE_STALE',
        'The definitions changed while they were being read; retry.',
        { cause: 'catalogue-unstable' },
      );
    }
    await pause(options.delayMs ?? CATALOGUE_STABLE_READ_DELAY_MS);
  }
}

/** {@link loadStableProjectCatalogue} over the per-process source, for the Engine entry points. */
export function getStableProjectCatalogue(
  engine: ProjectHomeLike,
): Promise<ProjectCatalogueResult> {
  return loadStableProjectCatalogue(defaultCatalogueSource(), engine.context.project.homeRoot);
}
