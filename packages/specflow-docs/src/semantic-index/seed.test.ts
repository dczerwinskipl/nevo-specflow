import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PROBE_TEXT } from '@nevo/ai-semantic-search';
import {
  createFakeEmbeddingProvider,
  type FakeEmbeddingProvider,
} from '@nevo/ai-semantic-search/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { parseDocsConfig } from '../config/docs-settings';
import { openFileSystemCorpus } from '../corpus/corpus';
import { QUERY_TIMEOUT_MS } from '../embeddings/embedding-providers';
import { readCheckoutDocsSettings } from '../reader/settings';
import { buildDocsIndex } from './build';
import { openDocsIndex } from './index-store';
import { cacheNotIgnoredReason } from './reasons';
import { seedIndexIfMissing, seedProjectIndex, type ProjectSeed } from './seed';

const base = mkdtempSync(join(tmpdir(), 'specflow-docs-seed-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

const doc = (id: string, text: string) =>
  `---\nid: ${id}\ntype: hub\ntitle: ${id}\nstatus: current\n---\n\n# ${id}\n\n## One\n\n${text}\n\n## Two\n\nStable part of ${id}.\n`;

const configuration = {
  docs: parseDocsConfig({ search: { semantic: true } }),
  embeddings: { protocol: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', model: 'm' },
} as const;

/** A checkout with `.nevo/config.yaml` and three documents. */
function checkout(name: string): string {
  const root = join(base, name);
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, '.nevo'));
  writeFileSync(join(root, '.nevo', 'config.yaml'), 'docs:\n  search:\n    semantic: true\n');
  for (const id of ['alpha', 'beta', 'gamma']) {
    writeFileSync(join(root, 'docs', `${id}.md`), doc(id, `First part of ${id}.`));
  }

  return root;
}

function open(root: string, admit = true) {
  const corpus = openFileSystemCorpus(root, configuration.docs);

  const refusal = admit ? undefined : cacheNotIgnoredReason('.nevo/local/cache/docs-index');

  return openDocsIndex(root, corpus, { writable: true }, () => Promise.resolve(refusal));
}

const environment = (provider: FakeEmbeddingProvider) => ({
  env: {},
  createProvider: () => provider,
});

/** Document texts the provider embedded (the probe left out). */
const embeddedTexts = (provider: FakeEmbeddingProvider) =>
  provider.calls.flatMap((call) => call.texts).filter((text) => text !== PROBE_TEXT);

const fingerprint = (root: string) => {
  const settings = readCheckoutDocsSettings(root, { rejectLinks: true });
  if (settings.status !== 'configured') {
    throw new Error('not configured');
  }

  return settings.fingerprint;
};

// Project Home with a complete index, built once for every case.
const home = checkout('home');
const homeProvider = createFakeEmbeddingProvider();
const built = buildDocsIndex(open(home), configuration, environment(homeProvider));

/** A linked worktree of `home`: its documents, one of them changed, and no index. */
function worktree(name: string): string {
  const root = join(base, name);
  cpSync(join(home, 'docs'), join(root, 'docs'), { recursive: true });
  cpSync(join(home, '.nevo', 'config.yaml'), join(root, '.nevo', 'config.yaml'));
  writeFileSync(join(root, 'docs', 'beta.md'), doc('beta', 'Changed part of beta.'));

  return root;
}

const indexDirectory = (root: string) => join(root, '.nevo', 'local', 'cache', 'docs-index');

describe('seedIndexIfMissing', () => {
  it('copies a matching Project Home index, so the refresh embeds only the changed chunk', async () => {
    expect(await built).toMatchObject({ status: 'done', outcome: { status: 'refreshed' } });
    const root = worktree('seeded');
    const index = open(root);
    const provider = createFakeEmbeddingProvider();

    expect(
      await seedIndexIfMissing(
        index,
        { checkoutRoot: home },
        { settingsFingerprint: fingerprint(root), provider },
      ),
    ).toMatchObject({ status: 'seeded' });
    expect(existsSync(join(indexDirectory(root), 'units.json'))).toBe(true);
    expect(provider.calls.map((call) => call.texts)).toEqual([[PROBE_TEXT]]);

    expect(await buildDocsIndex(index, configuration, environment(provider))).toMatchObject({
      status: 'done',
      outcome: { status: 'refreshed', rebuilt: false, embedded: 1, deleted: 0 },
    });
    expect(embeddedTexts(provider)).toEqual([expect.stringContaining('Changed part of beta.')]);
    expect(embeddedTexts(homeProvider).length).toBeGreaterThan(3);
  });

  it('copies nothing when the probe or the documentation settings differ', async () => {
    await built;
    const root = worktree('mismatch');
    const index = open(root);
    // Same model and space, other weights: only the recorded probe tells them apart.
    const otherWeights = createFakeEmbeddingProvider({ seed: 1 });

    expect(
      await seedIndexIfMissing(
        index,
        { checkoutRoot: home },
        { settingsFingerprint: fingerprint(root), provider: otherWeights },
      ),
    ).toEqual({ status: 'not-seeded', reason: 'identity-differs' });
    expect(
      await seedIndexIfMissing(
        index,
        { checkoutRoot: home },
        { settingsFingerprint: 'other', provider: createFakeEmbeddingProvider() },
      ),
    ).toEqual({ status: 'not-seeded', reason: 'settings-differ' });
    expect(existsSync(indexDirectory(root))).toBe(false);
  });

  it('copies nothing when the write admission refuses the destination', async () => {
    await built;
    const root = worktree('refused');
    const index = open(root, false);

    expect(
      await seedIndexIfMissing(
        index,
        { checkoutRoot: home },
        { settingsFingerprint: fingerprint(root), provider: createFakeEmbeddingProvider() },
      ),
    ).toEqual({ status: 'not-seeded', reason: 'not-written' });
    expect(existsSync(indexDirectory(root))).toBe(false);
    expect(index.writes.refusal()).toMatchObject({ code: 'index-unavailable' });
  });
});

describe('seedProjectIndex', () => {
  const seed = (root: string, rest: Partial<ProjectSeed> = {}): ProjectSeed => ({
    from: () => Promise.resolve(home),
    configuration,
    corpusSettings: openFileSystemCorpus(root, configuration.docs).settings,
    environment: environment(createFakeEmbeddingProvider()),
    provider: 'documents',
    ...rest,
  });

  it('seeds with the configured settings and resolves the source only when it can seed', async () => {
    await built;
    const root = worktree('project');
    const index = open(root);
    expect(await seedProjectIndex(index, seed(root))).toMatchObject({ status: 'seeded' });

    const from = vi.fn(() => Promise.resolve(home));
    expect(await seedProjectIndex(index, seed(root, { from }))).toBeUndefined();
    const other = worktree('no-endpoint');
    expect(
      await seedProjectIndex(
        open(other),
        seed(other, { from, configuration: { ...configuration, embeddings: undefined } }),
      ),
    ).toBeUndefined();
    expect(from).not.toHaveBeenCalled();
    expect(existsSync(indexDirectory(other))).toBe(false);
  });

  it('probes with the query-bounded provider when asked to', async () => {
    await built;
    const root = worktree('query-bounded');
    const used: number[] = [];
    const createProvider = ({ timeoutMs }: { timeoutMs?: number }) => {
      used.push(timeoutMs!);
      const provider = createFakeEmbeddingProvider();
      if (timeoutMs !== QUERY_TIMEOUT_MS) {
        // The documents provider would hang (an endpoint that does not answer).
        return { ...provider, embed: () => new Promise<never>(() => undefined) };
      }

      provider.failWith({ code: 'timeout', message: 'no answer within the query timeout' });

      return provider;
    };

    expect(
      await seedProjectIndex(
        open(root),
        seed(root, { environment: { env: {}, createProvider }, provider: 'query' }),
      ),
    ).toEqual({ status: 'not-seeded', reason: 'identity-differs' });
    expect(used).toContain(QUERY_TIMEOUT_MS);
    expect(existsSync(indexDirectory(root))).toBe(false);
  });
});
