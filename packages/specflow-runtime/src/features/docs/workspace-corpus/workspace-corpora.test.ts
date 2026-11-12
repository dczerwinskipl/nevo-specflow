import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PROBE_TEXT, inspectFileStoreWriter } from '@nevo/ai-semantic-search';
import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { seedIndexIfMissing, type CreateEmbeddingProvider } from '@nevo/specflow-docs';
import type { FastifyBaseLogger } from 'fastify';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createRefreshSlot } from './background-refresh';
import { createWorkspaceDocsOperations } from './operations';
import {
  createWorkspaceCorpora,
  MAX_WORKSPACE_INSTANCES,
  type WorkspaceResolution,
} from './workspace-corpora';

// The seed copy itself is specflow-docs' (seed.test.ts); here only who asks for it matters.
vi.mock('@nevo/specflow-docs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nevo/specflow-docs')>()),
  seedIndexIfMissing: vi.fn(() => Promise.resolve({ status: 'not-seeded', reason: 'no-source' })),
}));

const TRUSTED = 'http://trusted.test/v1';
const INDEX = ['.nevo', 'local', 'cache', 'docs-index'];
const base = mkdtempSync(join(tmpdir(), 'runtime-workspace-corpora-'));
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const doc = (id: string, sections: number) =>
  `---\nid: ${id}\ntype: hub\ntitle: ${id}\nstatus: current\n---\n\n# ${id}\n\n${Array.from(
    { length: sections },
    (_, n) => `## Part ${String(n)}\n\nWidget text ${String(n)}.`,
  ).join('\n\n')}\n`;

/** A checkout with semantic search on and one document, `large` above the read-time bound. */
function checkout(name: string, { large = false, config = '' } = {}): string {
  const root = join(base, name);
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, '.nevo'), { recursive: true });
  writeFileSync(
    join(root, '.nevo', 'config.yaml'),
    `docs:\n  search:\n    semantic: true\n${config}`,
  );
  writeFileSync(join(root, 'docs', `${name}.md`), doc(`${name}-doc`, large ? 20 : 1));

  return root;
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

const silent = { warn: vi.fn(), debug: vi.fn() } as unknown as FastifyBaseLogger;

/** Workspaces by id; the refresh's document requests (they carry a signal) wait for `gate`. */
function harness(workspaces: Map<string, WorkspaceResolution>, home: string) {
  const baseUrls: string[] = [];
  const gate = deferred();
  const embedding = deferred();
  const createProvider: CreateEmbeddingProvider = (settings, { signal }) => {
    baseUrls.push(settings.baseUrl);
    const provider = createFakeEmbeddingProvider();
    if (signal === undefined) {
      return provider;
    }

    return {
      ...provider,
      embed: async (texts, purpose) => {
        if (texts[0] !== PROBE_TEXT) {
          embedding.resolve();
          await gate.promise;
        }

        return provider.embed(texts, purpose);
      },
    };
  };

  const corpora = createWorkspaceCorpora({
    resolve: (id) => Promise.resolve(workspaces.get(id) ?? { status: 'not-registered' }),
    projectHome: home,
    trustedEmbeddings: { protocol: 'openai-compatible', baseUrl: TRUSTED, model: 'm' },
    env: {},
    createProvider,
    log: silent,
    slot: createRefreshSlot(),
  });

  return {
    corpora,
    docs: createWorkspaceDocsOperations(corpora),
    baseUrls,
    /** Resolves once a refresh is blocked on a document request. */
    embedding: () => embedding.promise,
    open: () => {
      gate.resolve();
    },
  };
}

const linked = (root: string): WorkspaceResolution => ({
  status: 'available',
  root,
  projectHome: false,
});

/** Every file below the checkout's index directory with its modification time. */
function indexFiles(root: string): string[] {
  const directory = join(root, ...INDEX);
  try {
    return readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .map((path) => `${path}@${String(statSync(join(directory, path)).mtimeMs)}`)
      .sort();
  } catch {
    return [];
  }
}

describe('workspace documentation instances', () => {
  it('keeps workspaces apart, reopens on a settings change, seeds only linked ones and never uses a worktree endpoint', async () => {
    const home = checkout('home');
    const a = checkout('a', {
      config:
        'ai:\n  embeddings:\n    protocol: openai-compatible\n    baseUrl: http://worktree.test/v1\n    model: evil\n',
    });
    const b = checkout('b');
    const workspaces = new Map([
      ['home', { status: 'available', root: home, projectHome: true } as const],
      ['a', linked(a)],
      ['b', linked(b)],
    ]);
    const h = harness(workspaces, home);
    try {
      const ids = async (id: string) => {
        const tree = await h.docs.tree(id);
        if (tree.kind !== 'ok') {
          throw new Error(tree.kind);
        }

        return tree.value.documents.map((item) => item.documentId);
      };

      expect(await ids('a')).toEqual(['a-doc']);
      // A's first read starts its seed in the background.
      while (vi.mocked(seedIndexIfMissing).mock.calls.length === 0) {
        await tick();
      }

      expect(await ids('b')).toEqual(['b-doc']);
      const search = await h.docs.search('home', {
        query: 'widget',
        limit: 5,
        includeNonAuthoritative: false,
        snippets: false,
      });
      expect(search).toMatchObject({
        kind: 'ok',
        value: { result: { mode: 'hybrid', results: [{ id: 'home-doc' }] } },
      });

      // A changed `docs` namespace reopens the instance over the new root.
      mkdirSync(join(b, 'manual'));
      writeFileSync(join(b, 'manual', 'c.md'), doc('c-doc', 1));
      writeFileSync(
        join(b, '.nevo', 'config.yaml'),
        'docs:\n  root: manual\n  search:\n    semantic: true\n',
      );
      expect(await ids('b')).toEqual(['c-doc']);
      expect(await h.docs.tree('gone')).toEqual({ kind: 'workspace-not-found' });

      await h.corpora.close();
      const seeded = vi.mocked(seedIndexIfMissing).mock.calls.map(([index, source]) => ({
        index: index.directory,
        source: source.checkoutRoot,
      }));
      expect(seeded).toContainEqual({ index: join(a, ...INDEX), source: home });
      expect(seeded.some(({ index }) => index === join(home, ...INDEX))).toBe(false);
      expect(new Set(h.baseUrls)).toEqual(new Set([TRUSTED]));
    } finally {
      h.open();
      await h.corpora.close();
    }
  });

  it('runs one background refresh at a time, and a release waits for it and writes nothing after', async () => {
    const home = checkout('home2');
    const a = checkout('a2', { large: true });
    const b = checkout('b2', { large: true });
    const workspaces = new Map<string, WorkspaceResolution>([
      ['a', linked(a)],
      ['b', linked(b)],
    ]);
    const h = harness(workspaces, home);
    const request = { query: 'widget', limit: 5, includeNonAuthoritative: false, snippets: false };
    try {
      // A's gap is larger than a search embeds: its catch-up takes the slot and blocks.
      expect(await h.docs.search('a', request)).toMatchObject({
        value: { result: { mode: 'lexical', reason: { code: 'index-building' } } },
      });
      await h.embedding();
      // B's seed cannot take the slot: B answers lexically, refreshes nothing and is not seeded.
      const seededIndexes = () =>
        vi.mocked(seedIndexIfMissing).mock.calls.map(([index]) => index.directory);
      expect(await h.docs.search('b', request)).toMatchObject({
        value: {
          result: {
            mode: 'lexical',
            reason: {
              code: 'index-building',
              message: expect.stringContaining('Project Home') as unknown,
            },
          },
        },
      });
      expect(seededIndexes()).not.toContain(join(b, ...INDEX));
      expect(indexFiles(b).filter((file) => file.startsWith('vectors'))).toEqual([]);

      let released = false;
      const releasing = h.corpora.release('a').then((hold) => {
        released = true;

        return hold;
      });
      await tick();
      await tick();
      expect(released).toBe(false);
      h.open();
      const hold = await releasing;
      const written = indexFiles(a);
      expect(await inspectFileStoreWriter({ directory: join(a, ...INDEX, 'vectors') })).toEqual({
        status: 'free',
      });
      expect(await h.docs.search('a', request)).toEqual({ kind: 'workspace-unavailable' });
      hold.end();
      workspaces.delete('a');
      expect(await h.docs.search('a', request)).toEqual({ kind: 'workspace-not-found' });
      expect(indexFiles(a)).toEqual(written);

      // The slot is free again: B's next request runs its seed.
      await h.docs.tree('b');
      while (!seededIndexes().includes(join(b, ...INDEX))) {
        await tick();
      }
    } finally {
      h.open();
      await h.corpora.close();
    }
  });

  it('evicts the least recently used instance only after its refresh has ended', async () => {
    const home = checkout('home3');
    const workspaces = new Map<string, WorkspaceResolution>();
    for (let n = 0; n <= MAX_WORKSPACE_INSTANCES; n += 1) {
      workspaces.set(`w${String(n)}`, linked(checkout(`w${String(n)}`, { large: n === 0 })));
    }

    const h = harness(workspaces, home);
    const request = { query: 'widget', limit: 5, includeNonAuthoritative: false, snippets: false };
    try {
      await h.docs.search('w0', request);
      await h.embedding();
      for (let n = 1; n <= MAX_WORKSPACE_INSTANCES; n += 1) {
        expect(await h.docs.tree(`w${String(n)}`)).toMatchObject({ kind: 'ok' });
      }

      // w0 was evicted; it opens again only once its refresh has ended.
      let reopened = false;
      const again = h.docs.tree('w0').then((tree) => {
        reopened = true;

        return tree;
      });
      await tick();
      await tick();
      expect(reopened).toBe(false);
      h.open();
      expect(await again).toMatchObject({ kind: 'ok' });
    } finally {
      h.open();
      await h.corpora.close();
    }
  });
});
