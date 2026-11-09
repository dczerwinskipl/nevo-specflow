import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { DocsSearchResultSchema } from '@nevo/specflow-contracts/docs';
import { Value } from 'typebox/value';
import { afterAll, describe, expect, it } from 'vitest';

import { runDocs } from '../../../test/support/run-docs';

// A project with semantic search enabled in the project file and the endpoint in the local file.
const root = mkdtempSync(join(tmpdir(), 'specflow-docs-search-cli-'));
mkdirSync(join(root, 'docs'));
mkdirSync(join(root, '.nevo', 'local'), { recursive: true });
writeFileSync(join(root, '.nevo', 'config.yaml'), 'docs:\n  search:\n    semantic: true\n');
writeFileSync(
  join(root, '.nevo', 'local', 'config.yaml'),
  'ai:\n  embeddings:\n    protocol: openai-compatible\n    baseUrl: http://127.0.0.1:1/v1\n    model: fake-embedding\n',
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
    expect(lexical.stdout).toContain('  read: pnpm docs:get guide');
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
});
