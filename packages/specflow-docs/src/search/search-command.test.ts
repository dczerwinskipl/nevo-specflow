import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { DocsSearchResultSchema } from '@nevo/specflow-contracts/docs';
import { Value } from 'typebox/value';
import { afterAll, describe, expect, it } from 'vitest';

import { runDocs } from '../../test/support/run-docs';
import { CATCH_UP_START_COOLDOWN_MS } from '../semantic-index/catch-up';
import type { DetachedProcessRequest } from '../semantic-index/detached-process';
import { createProgressRecorder } from '../semantic-index/progress';

// A project with semantic search enabled in the project file and the endpoint in the local file.
const root = mkdtempSync(join(tmpdir(), 'specflow-docs-search-cli-'));
mkdirSync(join(root, 'docs'));
mkdirSync(join(root, '.nevo', 'local'), { recursive: true });
writeFileSync(join(root, '.nevo', 'config.yaml'), 'docs:\n  search:\n    semantic: true\n');
writeFileSync(
  join(root, '.nevo', 'local', 'config.yaml'),
  'ai:\n  embeddings:\n    baseUrl: http://127.0.0.1:1/v1\n    model: fake-embedding\n',
);
writeFileSync(
  join(root, 'docs', 'guide.md'),
  '---\nid: guide\ntype: hub\ntitle: Guide\nstatus: current\n---\n\n# Guide\n\n## Install\n\nInstall the widget with pnpm.\n',
);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('docs search and semantic status', () => {
  it('answers with the contract in hybrid mode and in lexical mode, exiting 0 in both', async () => {
    const provider = createFakeEmbeddingProvider();
    const hybrid = await runDocs(root, ['search', 'install', 'widget', '--json'], undefined, {
      createEmbeddingProvider: () => provider,
    });
    expect(hybrid.exitCode).toBe(0);
    const result: unknown = JSON.parse(hybrid.stdout.join('\n'));
    expect(Value.Check(DocsSearchResultSchema, result)).toBe(true);
    expect(result).toMatchObject({ mode: 'hybrid', results: [{ id: 'guide' }] });
    expect(existsSync(join(root, '.nevo', 'local', 'cache', 'docs-index', 'units.json'))).toBe(
      true,
    );

    provider.failWith({ code: 'unreachable', message: 'connection refused' });
    const lexical = await runDocs(root, ['search', 'install', 'widget'], undefined, {
      createEmbeddingProvider: () => provider,
      getCommand: 'pnpm docs:get',
    });
    expect(lexical).toMatchObject({ exitCode: 0, stderr: [] });
    expect(lexical.stdout[0]).toMatch(
      /^mode: lexical \(endpoint-unreachable: .*connection refused/,
    );
    expect(lexical.stdout.slice(1)).toEqual([
      '',
      'guide — Guide (hub, current)',
      '  sections: Install',
      '',
      'read all: pnpm docs:get --content guide',
    ]);
  });

  it('semantic status exits 1 when semantic search is enabled but the endpoint is unreachable', async () => {
    const provider = createFakeEmbeddingProvider();
    provider.failWith({ code: 'timeout', message: 'no answer' });
    const run = await runDocs(root, ['semantic', 'status'], undefined, {
      createEmbeddingProvider: () => provider,
    });
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain(
      'reachable: no (The embedding endpoint failed (timeout): no answer)',
    );
    expect(run.stderr.at(-1)).toMatch(/semantic search is enabled but unavailable/);
  });

  it('semantic status reports an index too large for a search to build as index-building, exit 0', async () => {
    // A fresh project (no index) with more sections than a search embeds.
    const large = mkdtempSync(join(tmpdir(), 'specflow-docs-status-cli-'));
    try {
      mkdirSync(join(large, 'docs'));
      mkdirSync(join(large, '.nevo', 'local'), { recursive: true });
      for (const file of ['config.yaml', join('local', 'config.yaml')]) {
        writeFileSync(join(large, '.nevo', file), readFileSync(join(root, '.nevo', file)));
      }

      const sections = Array.from({ length: 20 }, (_, n) => `## Part ${String(n)}\n\nText.`);
      writeFileSync(
        join(large, 'docs', 'big.md'),
        `---\nid: big\ntype: hub\ntitle: Big\nstatus: current\n---\n\n# Big\n\n${sections.join('\n\n')}\n`,
      );
      const run = await runDocs(large, ['semantic', 'status'], undefined, {
        createEmbeddingProvider: () => createFakeEmbeddingProvider(),
        semanticIndexCommand: 'pnpm docs:semantic index',
      });
      expect(run).toMatchObject({ exitCode: 0, stderr: [] });
      expect(run.stdout.at(-1)).toMatch(
        /^search mode: lexical \(index-building: .*run `pnpm docs:semantic index`/,
      );

      // A search answers lexically at once and starts one background `semantic index`; searches
      // within the cooldown start none, and none starts while a live writer holds the index.
      const spawned: DetachedProcessRequest[] = [];
      const search = (now = Date.now()) =>
        runDocs(large, ['search', 'part', '--json'], undefined, {
          createEmbeddingProvider: () => createFakeEmbeddingProvider(),
          semanticIndexCommand: 'pnpm docs:semantic index',
          semanticStatusCommand: 'pnpm docs:semantic status',
          backgroundIndex: { command: 'node', args: ['bin.js', 'semantic', 'index'] },
          spawnDetached: (request) => {
            spawned.push(request);

            return Promise.resolve();
          },
          now: () => now,
        });
      const first = await search();
      expect(first.exitCode).toBe(0);
      expect(JSON.parse(first.stdout.join('\n'))).toMatchObject({
        mode: 'lexical',
        reason: {
          code: 'index-building',
          message: expect.stringMatching(
            /\(16\); a background `pnpm docs:semantic index` is updating it; follow it with `pnpm docs:semantic status`\.$/,
          ) as unknown,
        },
      });
      const index = join(large, '.nevo', 'local', 'cache', 'docs-index');
      expect(spawned).toEqual([
        {
          command: 'node',
          args: ['bin.js', 'semantic', 'index'],
          cwd: large,
          logFile: join(index, 'catch-up.log'),
        },
      ]);
      await search();
      expect(spawned).toHaveLength(1);
      await search(Date.now() + 2 * CATCH_UP_START_COOLDOWN_MS);
      expect(spawned).toHaveLength(2);

      // The parent process stands in for a live writer that recorded its progress.
      mkdirSync(join(index, 'vectors'), { recursive: true });
      writeFileSync(
        join(index, 'vectors', 'writer-1.lock'),
        JSON.stringify({ pid: process.ppid, token: 'other' }),
      );
      const started = Date.now();
      const writer = createProgressRecorder(index, { pid: process.ppid, now: () => started });
      void writer.update({ embedded: 0, total: 21 });
      await writer.update({ embedded: 16, total: 21 });
      const during = await search(Date.now() + 4 * CATCH_UP_START_COOLDOWN_MS);
      expect(spawned).toHaveLength(2);
      expect(during.stdout.join('\n')).toContain(
        `process ${String(process.ppid)} is updating it in the background (16/21 chunks since`,
      );
      const status = await runDocs(large, ['semantic', 'status'], undefined, {
        createEmbeddingProvider: () => createFakeEmbeddingProvider(),
      });
      expect(status.stdout).toContain(
        `updating in background: 16/21 chunks (since ${new Date(started).toISOString()}, process ${String(process.ppid)})`,
      );
    } finally {
      rmSync(large, { recursive: true, force: true });
    }
  });
});
