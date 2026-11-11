import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  createFileVectorStore,
  createOpenAiCompatibleEmbeddingProvider,
} from '@nevo/ai-semantic-search';
import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { DocsStatusSchema } from '@nevo/specflow-contracts/docs';
import { Value } from 'typebox/value';
import { afterAll, describe, expect, it } from 'vitest';

import { runDocs } from '../../test/support/run-docs';
import { QUERY_TIMEOUT_MS, type CreateEmbeddingProvider } from '../embeddings/embedding-providers';
import { CATCH_UP_MARKER_FILE } from './catch-up';

// A project without an index and more sections than a search embeds; the endpoint sets batchSize.
const root = mkdtempSync(join(tmpdir(), 'specflow-docs-semantic-cli-'));
mkdirSync(join(root, 'docs'));
mkdirSync(join(root, '.nevo', 'local'), { recursive: true });
writeFileSync(join(root, '.nevo', 'config.yaml'), 'docs:\n  search:\n    semantic: true\n');
writeFileSync(
  join(root, '.nevo', 'local', 'config.yaml'),
  'ai:\n  embeddings:\n    baseUrl: http://127.0.0.1:1/v1\n    model: fake-embedding\n    batchSize: 8\n',
);
const sections = Array.from({ length: 20 }, (_, n) => `## Part ${String(n)}\n\nText.`);
writeFileSync(
  join(root, 'docs', 'big.md'),
  `---\nid: big\ntype: hub\ntitle: Big\nstatus: current\n---\n\n# Big\n\n${sections.join('\n\n')}\n`,
);

afterAll(() => rmSync(root, { recursive: true, force: true }));

const provider = () => createFakeEmbeddingProvider();

describe('semantic status and the background catch-up', () => {
  it('status --json is the DocsStatus contract, without endpoint settings outside it', async () => {
    const run = await runDocs(root, ['semantic', 'status', '--json'], undefined, {
      createEmbeddingProvider: provider,
    });
    expect(run.exitCode).toBe(0);
    const status: unknown = JSON.parse(run.stdout.join('\n'));
    expect(Value.Check(DocsStatusSchema, status)).toBe(true);
  });

  it('a search whose background start fails still exits 0 and leaves no cooldown behind', async () => {
    const run = await runDocs(root, ['search', 'part'], undefined, {
      createEmbeddingProvider: provider,
      backgroundIndex: { command: 'node', args: ['bin.js', 'semantic', 'index'] },
      spawnDetached: () => {
        throw new Error('spawn EACCES');
      },
    });
    expect(run).toMatchObject({ exitCode: 0, stderr: [] });
    expect(run.stdout[0]).toMatch(
      /index-building: .*starting a background `nevo-specflow docs semantic index` failed \(spawn EACCES\); run it yourself\.\)$/,
    );
    expect(
      existsSync(join(root, '.nevo', 'local', 'cache', 'docs-index', CATCH_UP_MARKER_FILE)),
    ).toBe(false);
  });

  it('a background executable that fails to start is logged and reported, not claimed running', async () => {
    // The real spawner: the missing executable fails through the child's asynchronous `error`.
    const missing = join(root, 'no-such-node.exe');
    const search = () =>
      runDocs(root, ['search', 'part'], undefined, {
        createEmbeddingProvider: provider,
        backgroundIndex: { command: missing, args: ['bin.js', 'semantic', 'index'] },
      });
    const failedStart =
      /index-building: .*starting a background `nevo-specflow docs semantic index` failed \(.*ENOENT.*\); run it yourself\.\)$/;

    for (const run of [await search(), await search()]) {
      expect(run).toMatchObject({ exitCode: 0, stderr: [] });
      expect(run.stdout[0]).toMatch(failedStart);
    }

    const index = join(root, '.nevo', 'local', 'cache', 'docs-index');
    expect(existsSync(join(index, CATCH_UP_MARKER_FILE))).toBe(false);
    expect(readFileSync(join(index, 'catch-up.log'), 'utf8')).toMatch(
      /could not start .*no-such-node\.exe: .*ENOENT/,
    );
  });
});

describe('semantic index', () => {
  const index = (extra: Parameters<typeof runDocs>[3] = {}) =>
    runDocs(root, ['semantic', 'index'], undefined, extra);

  it('fails (exit 1, cause on stderr, nothing on stdout) when nothing could be attempted', async () => {
    // Without the local endpoint configuration the project has no endpoint.
    const bare = mkdtempSync(join(tmpdir(), 'specflow-docs-semantic-bare-'));
    try {
      mkdirSync(join(bare, 'docs'));
      mkdirSync(join(bare, '.nevo'));
      writeFileSync(join(bare, '.nevo', 'config.yaml'), 'docs:\n  search:\n    semantic: true\n');
      const run = await runDocs(bare, ['semantic', 'index']);
      expect(run).toEqual({
        exitCode: 1,
        stdout: [],
        stderr: [expect.stringMatching(/^Index not built \(no-endpoint\): /)],
      });
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('fails when the endpoint fails or another writer holds the index', async () => {
    const failing = () => {
      const fake = createFakeEmbeddingProvider();
      fake.failWith({ code: 'unreachable', message: 'connect ECONNREFUSED' });

      return fake;
    };

    const failed = await index({ createEmbeddingProvider: failing });
    expect(failed).toMatchObject({ exitCode: 1, stdout: [] });
    expect(failed.stderr.at(-1)).toMatch(
      /^Index not updated \(endpoint-unreachable\): .*ECONNREFUSED/,
    );

    // Another writer, through a second store on the same directory (in-process here).
    const store = createFileVectorStore({
      directory: join(root, '.nevo', 'local', 'cache', 'docs-index', 'vectors'),
    });
    const held = await store.openWriter();
    expect(held.status).toBe('opened');
    try {
      const busy = await index({ createEmbeddingProvider: provider });
      expect(busy).toMatchObject({ exitCode: 1, stdout: [] });
      expect(busy.stderr.at(-1)).toMatch(
        /^Index not updated \(index-building\): Another process is updating the index/,
      );
    } finally {
      if (held.status === 'opened') {
        await held.writer.close();
      }
    }
  });

  it('rebuilds when the endpoint changes its dimension under the same model name', async () => {
    // The configuration declares no dimension, so only a probe of the endpoint can tell.
    const endpoint = (dimensions: number) => () => ({
      ...createFakeEmbeddingProvider({ dimensions }),
      dimensions: undefined,
    });
    const build = async (dimensions: number) =>
      runDocs(root, ['semantic', 'index'], undefined, {
        createEmbeddingProvider: endpoint(dimensions),
      });

    expect((await build(8)).stdout).toEqual([expect.stringMatching(/^Index rebuilt: /)]);
    expect((await build(8)).stdout).toEqual([expect.stringMatching(/^Index current /)]);
    expect((await build(16)).stdout).toEqual([expect.stringMatching(/^Index rebuilt: /)]);
  });

  it('rebuilds when the weights change under the same name or the endpoint moves to another server', async () => {
    // The fake's space follows the configured base URL, like the real adapter's fingerprint.
    const endpoint =
      (seed: number): CreateEmbeddingProvider =>
      (settings) =>
        createFakeEmbeddingProvider({ seed, space: settings.baseUrl });
    const build = async (seed: number) =>
      runDocs(root, ['semantic', 'index'], undefined, { createEmbeddingProvider: endpoint(seed) });
    const local = join(root, '.nevo', 'local', 'config.yaml');
    const original = readFileSync(local, 'utf8');

    expect((await build(1)).stdout).toEqual([expect.stringMatching(/^Index (rebuilt|refreshed)/)]);
    expect((await build(1)).stdout).toEqual([expect.stringMatching(/^Index current /)]);
    expect((await build(2)).stdout).toEqual([expect.stringMatching(/^Index rebuilt: /)]);
    try {
      writeFileSync(local, original.replace('127.0.0.1:1', '127.0.0.1:2'));
      expect((await build(2)).stdout).toEqual([expect.stringMatching(/^Index rebuilt: /)]);
    } finally {
      writeFileSync(local, original);
    }
  });
});

describe('semantic status during an endpoint outage', () => {
  /** A project whose endpoint is a local server that accepts requests and never answers. */
  async function hangingEndpoint(semantic: boolean) {
    const requests: string[] = [];
    const server = createServer((request) => {
      requests.push(request.url ?? '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const project = mkdtempSync(join(tmpdir(), 'specflow-docs-status-outage-'));
    mkdirSync(join(project, 'docs'));
    mkdirSync(join(project, '.nevo', 'local'), { recursive: true });
    writeFileSync(
      join(project, '.nevo', 'config.yaml'),
      `docs:\n  search:\n    semantic: ${String(semantic)}\n`,
    );
    // The document timeout stays the default 60 s; the status must not wait for it.
    writeFileSync(
      join(project, '.nevo', 'local', 'config.yaml'),
      `ai:\n  embeddings:\n    baseUrl: http://127.0.0.1:${String(port)}/v1\n    model: m\n`,
    );

    return {
      project,
      requests,
      [Symbol.asyncDispose]: async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        rmSync(project, { recursive: true, force: true });
      },
    };
  }

  it('answers unreachable within the query timeout through the real endpoint adapter', async () => {
    await using endpoint = await hangingEndpoint(true);
    // The real adapter, with every timeout cut to 50 ms so the test does not wait the real 3 s;
    // the timeout each provider was given is recorded.
    const timeouts: number[] = [];
    const createEmbeddingProvider: CreateEmbeddingProvider = (settings) => {
      timeouts.push(settings.timeoutMs ?? Number.NaN);

      return createOpenAiCompatibleEmbeddingProvider({
        ...settings,
        timeoutMs: Math.min(settings.timeoutMs ?? Number.POSITIVE_INFINITY, 50),
      });
    };

    const started = performance.now();
    const run = await runDocs(endpoint.project, ['semantic', 'status', '--json'], undefined, {
      createEmbeddingProvider,
    });
    const elapsed = performance.now() - started;

    // The query provider (3000 ms) and the documents provider (the default); the probe answered
    // within the cut query timeout, so it was the query provider's.
    expect(timeouts).toEqual([QUERY_TIMEOUT_MS, DEFAULT_EMBEDDING_TIMEOUT_MS]);
    expect(elapsed).toBeLessThan(1000);
    expect(endpoint.requests).toHaveLength(1);
    expect(run.exitCode).toBe(1);
    expect(JSON.parse(run.stdout.join('\n'))).toMatchObject({
      mode: 'lexical',
      reason: { code: 'endpoint-unreachable' },
      reachability: { reachable: false },
      failed: true,
    });
  });

  it('sends the endpoint nothing while semantic search is disabled', async () => {
    await using endpoint = await hangingEndpoint(false);
    const run = await runDocs(endpoint.project, ['semantic', 'status', '--json']);

    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout.join('\n'))).toMatchObject({
      mode: 'lexical',
      reason: { code: 'semantic-disabled' },
      reachability: null,
      failed: false,
    });
    expect(endpoint.requests).toEqual([]);
  });
});

describe('an endpoint busy with a running refresh', () => {
  it('reports index-building while a live writer updates the index, endpoint-unreachable otherwise', async () => {
    const timingOut = () => {
      const fake = createFakeEmbeddingProvider();
      fake.failWith({ code: 'timeout', message: 'no answer within 3000 ms' });

      return fake;
    };

    // A complete index first, so a search reaches the query embedding.
    expect(
      (await runDocs(root, ['semantic', 'index'], undefined, { createEmbeddingProvider: provider }))
        .exitCode,
    ).toBe(0);

    const alone = await runDocs(root, ['semantic', 'status'], undefined, {
      createEmbeddingProvider: timingOut,
    });
    expect(alone.exitCode).toBe(1);
    expect(alone.stdout.at(-1)).toMatch(/^search mode: lexical \(endpoint-unreachable: /);

    const store = createFileVectorStore({
      directory: join(root, '.nevo', 'local', 'cache', 'docs-index', 'vectors'),
    });
    const held = await store.openWriter();
    expect(held.status).toBe('opened');
    try {
      const status = await runDocs(root, ['semantic', 'status'], undefined, {
        createEmbeddingProvider: timingOut,
      });
      expect(status.exitCode).toBe(0);
      expect(status.stdout.at(-1)).toMatch(
        /^search mode: lexical \(index-building: The embedding endpoint did not answer \(timeout: .*being updated in the background/,
      );
      const search = await runDocs(root, ['search', 'part'], undefined, {
        createEmbeddingProvider: timingOut,
      });
      expect(search.exitCode).toBe(0);
      expect(search.stdout[0]).toMatch(/^mode: lexical \(index-building: The embedding endpoint/);
    } finally {
      if (held.status === 'opened') {
        await held.writer.close();
      }
    }
  });
});
