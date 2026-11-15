import {
  DocsError,
  openCorpus,
  readCheckoutDocsSettings,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
  type DocsCorpus,
} from '@nevo/specflow-docs';
import type { FastifyBaseLogger } from 'fastify';

import type { RefreshSlot } from './background-refresh';
import { openCorpusInstance, type CorpusInstance, type CorpusReads } from './corpus-instance';

/** Instances kept open at once (E8); the least recently used one is evicted beyond it. */
export const MAX_WORKSPACE_INSTANCES = 4;

/** A workspace as one request finds it (C5); an unavailable one carries no reason (no leak). */
export type WorkspaceResolution =
  | { readonly status: 'not-registered' | 'unavailable' }
  | {
      readonly status: 'available';
      readonly root: string;
      /** The Project Home checkout, which is never seeded. */
      readonly projectHome: boolean;
    };

export type ResolveWorkspace = (workspaceId: string) => Promise<WorkspaceResolution>;

/**
 * Why a workspace's documentation cannot be read now:
 * - `workspace-not-found`: not registered;
 * - `workspace-unavailable`: registered, but its checkout cannot be read now (missing, moved,
 *   released for Close, or the Runtime is closing);
 * - `not-configured`: the checkout's `docs.root` is not a directory;
 * - `docs-unavailable`: the checkout's `docs` settings or `docs.yaml` are invalid or a link.
 */
export type WorkspaceDocsFailure =
  | { readonly kind: 'workspace-not-found' | 'workspace-unavailable' | 'docs-unavailable' }
  /** `docsRoot`: the configured `docs.root`, relative to the checkout. */
  | { readonly kind: 'not-configured'; readonly docsRoot: string };

export type WorkspaceDocsResult<T> =
  | {
      readonly kind: 'ok';
      readonly workspaceId: string;
      /** The checkout's `docs.root`, which tree and search paths are relative to (via the CLI). */
      readonly docsRoot: string;
      readonly value: T;
    }
  | WorkspaceDocsFailure;

/** Held while a workspace's checkout may be deleted; `end` lets requests open it again. */
export interface WorkspaceDocsRelease {
  end(): void;
}

export interface WorkspaceCorporaOptions {
  readonly resolve: ResolveWorkspace;
  /** Project Home's checkout root, the seed source of every other checkout (read when seeding). */
  readonly projectHome: () => string;
  /** The Runtime's own `ai.embeddings` (C10); a checkout's are never read. */
  readonly trustedEmbeddings: DocsConfiguration['embeddings'];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
  readonly log: FastifyBaseLogger;
  readonly slot: RefreshSlot;
}

/**
 * The documentation instances of the registered workspaces. Every request resolves its workspace
 * through the Engine and re-reads the checkout's documentation settings; an instance is reused only
 * while its root and settings fingerprint are unchanged, otherwise it is disposed (refresh stopped
 * and awaited) before its successor opens.
 */
export interface WorkspaceCorpora {
  use<T>(
    workspaceId: string,
    operation: (reads: CorpusReads, docsRoot: string) => Promise<T>,
  ): Promise<WorkspaceDocsResult<T>>;
  /**
   * Before a workspace's checkout is deleted (E9): disposes its instance, waiting for a running
   * refresh and for operations in progress, and refuses new requests (`workspace-unavailable`)
   * until `end`. Nothing of the instance writes once this resolves.
   */
  release(workspaceId: string): Promise<WorkspaceDocsRelease>;
  /**
   * Starts the full background refresh of a workspace whose checkout has semantic search on (the
   * Runtime start refresh of its own checkout), in the Runtime-wide slot. Its instance is one of
   * these instances, so `release` and `close` stop it; after `close`, or while released, nothing
   * is opened.
   */
  startRefresh(workspaceId: string): Promise<void>;
  /** Disposes every instance (Runtime close); later requests answer `workspace-unavailable`. */
  close(): Promise<void>;
}

interface Entry {
  readonly root: string;
  readonly fingerprint: string;
  readonly instance: Promise<CorpusInstance>;
}

export function createWorkspaceCorpora(options: WorkspaceCorporaOptions): WorkspaceCorpora {
  const { resolve, log } = options;
  // In least-recently-used order (a use moves its entry to the end).
  const entries = new Map<string, Entry>();
  // The latest disposal per workspace; a successor opens only after it.
  const disposing = new Map<string, Promise<void>>();
  const fences = new Map<string, number>();
  let closed = false;

  const unavailable = { kind: 'workspace-unavailable' } as const;
  const refused = (workspaceId: string) => closed || fences.has(workspaceId);

  const evict = (workspaceId: string): Promise<void> => {
    const entry = entries.get(workspaceId);
    if (entry === undefined) {
      return disposing.get(workspaceId) ?? Promise.resolve();
    }

    entries.delete(workspaceId);
    const done = entry.instance
      .then((instance) => instance.dispose())
      .catch((error: unknown) => {
        log.warn({ err: error, workspaceId }, 'A documentation instance was not disposed cleanly.');
      });
    disposing.set(workspaceId, done);
    void done.finally(() => {
      if (disposing.get(workspaceId) === done) {
        disposing.delete(workspaceId);
      }
    });

    return done;
  };

  // The checkout's documentation settings or `docs.yaml` are invalid, a link, or its root vanished
  // (a `DocsError`), or reading it failed otherwise. Only the log carries the error. A failure of
  // one instance evicts only that instance, never a newer one that replaced it meanwhile.
  const docsFailure = (
    workspaceId: string,
    error: unknown,
    failed?: Entry,
  ): WorkspaceDocsFailure => {
    if (error instanceof DocsError) {
      log.warn({ err: error, workspaceId }, 'The documentation of a workspace is unavailable.');
    } else {
      log.error({ err: error, workspaceId }, 'Reading the documentation of a workspace failed.');
    }

    if (failed === undefined || entries.get(workspaceId) === failed) {
      void evict(workspaceId);
    }

    return { kind: 'docs-unavailable' };
  };

  const open = (
    workspaceId: string,
    root: string,
    fingerprint: string,
    corpus: DocsCorpus,
    configuration: DocsConfiguration,
    projectHome: boolean,
  ): Entry => {
    const previous = disposing.get(workspaceId) ?? Promise.resolve();
    const instance = previous.then(() =>
      openCorpusInstance({
        root,
        corpus,
        configuration,
        env: options.env,
        log,
        slot: options.slot,
        ...(projectHome
          ? {}
          : { seed: { from: options.projectHome(), settingsFingerprint: fingerprint } }),
        ...(options.createProvider ? { createProvider: options.createProvider } : {}),
      }),
    );

    return { root, fingerprint, instance };
  };

  type Acquired =
    | { readonly kind: 'acquired'; readonly entry: Entry; readonly docsRoot: string }
    | WorkspaceDocsFailure
    | { readonly kind: 'semantic-off' };

  // Resolves the workspace, re-reads its settings and finds or opens its entry. `semanticOnly`
  // (the start refresh) opens nothing for a checkout without semantic search.
  const acquire = async (workspaceId: string, semanticOnly: boolean): Promise<Acquired> => {
    if (refused(workspaceId)) {
      return unavailable;
    }

    const resolution = await resolve(workspaceId);
    if (resolution.status !== 'available') {
      await evict(workspaceId);

      return resolution.status === 'not-registered' ? { kind: 'workspace-not-found' } : unavailable;
    }

    // Nothing below awaits until the entry is in place, so a release either sees it or this
    // request sees the release.
    if (refused(workspaceId)) {
      return unavailable;
    }

    const { root, projectHome } = resolution;
    let settings: ReturnType<typeof readCheckoutDocsSettings>;
    try {
      settings = readCheckoutDocsSettings(root, { rejectLinks: true });
    } catch (error) {
      return docsFailure(workspaceId, error);
    }

    if (settings.status === 'not-configured') {
      void evict(workspaceId);

      return { kind: 'not-configured', docsRoot: settings.root };
    }

    // C10: only the checkout's `docs.search.semantic` decides, and only to turn it off.
    const embeddings = settings.docs.search.semantic ? options.trustedEmbeddings : undefined;
    let entry = entries.get(workspaceId);
    if (
      entry !== undefined &&
      (entry.root !== root || entry.fingerprint !== settings.fingerprint)
    ) {
      void evict(workspaceId);
      entry = undefined;
    }

    if (entry === undefined) {
      if (semanticOnly && embeddings === undefined) {
        return { kind: 'semantic-off' };
      }

      let corpus: DocsCorpus;
      try {
        corpus = openCorpus(root, settings.corpus);
      } catch (error) {
        return docsFailure(workspaceId, error);
      }

      const configuration: DocsConfiguration = { docs: settings.docs, embeddings };
      entry = open(workspaceId, root, settings.fingerprint, corpus, configuration, projectHome);
      entries.set(workspaceId, entry);
      for (const oldest of entries.keys()) {
        if (entries.size <= MAX_WORKSPACE_INSTANCES) {
          break;
        }

        void evict(oldest);
      }
    } else {
      entries.delete(workspaceId);
      entries.set(workspaceId, entry);
    }

    return { kind: 'acquired', entry, docsRoot: settings.docs.root };
  };

  return {
    async use(workspaceId, operation) {
      const acquired = await acquire(workspaceId, false);
      if (acquired.kind !== 'acquired') {
        // Only the start refresh asks for a semantic-only acquisition.
        return acquired.kind === 'semantic-off' ? unavailable : acquired;
      }

      const { entry, docsRoot } = acquired;
      let instance: CorpusInstance;
      try {
        instance = await entry.instance;
      } catch (error) {
        return docsFailure(workspaceId, error, entry);
      }

      let used: { value: Awaited<ReturnType<typeof operation>> } | undefined;
      try {
        used = await instance.use(async (reads) => ({ value: await operation(reads, docsRoot) }));
      } catch (error) {
        return docsFailure(workspaceId, error, entry);
      }

      return used === undefined ? unavailable : { kind: 'ok', workspaceId, docsRoot, ...used };
    },
    async startRefresh(workspaceId) {
      const acquired = await acquire(workspaceId, true);
      if (acquired.kind !== 'acquired') {
        return;
      }

      let instance: CorpusInstance;
      try {
        instance = await acquired.entry.instance;
      } catch (error) {
        docsFailure(workspaceId, error, acquired.entry);

        return;
      }

      // A disposed instance (released or closed meanwhile) answers `stopped` and starts nothing.
      instance.startRefresh();
    },
    async release(workspaceId) {
      fences.set(workspaceId, (fences.get(workspaceId) ?? 0) + 1);
      let ended = false;
      const end = () => {
        if (ended) {
          return;
        }

        ended = true;
        const count = (fences.get(workspaceId) ?? 1) - 1;
        if (count === 0) {
          fences.delete(workspaceId);
        } else {
          fences.set(workspaceId, count);
        }
      };

      try {
        await evict(workspaceId);
      } catch (error) {
        end();

        throw error;
      }

      return { end };
    },
    async close() {
      closed = true;
      for (const workspaceId of [...entries.keys()]) {
        void evict(workspaceId);
      }

      await Promise.all([...disposing.values()]);
    },
  };
}
