import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFakeEmbeddingProvider } from '@nevo/ai-semantic-search/testing';
import { DocsStatusSchema } from '@nevo/specflow-contracts/docs';
import { Value } from 'typebox/value';
import { afterAll, describe, expect, it } from 'vitest';

import { runDocs } from '../../test/support/run-docs';
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
});

describe('semantic index', () => {
  it('rebuilds when the endpoint changes its dimension under the same model name', async () => {
    // The configuration declares no dimension, so only a probe of the endpoint can tell.
    const endpoint = (dimensions: number) => () => ({
      ...createFakeEmbeddingProvider({ dimensions }),
      dimensions: undefined,
    });
    const index = async (dimensions: number) =>
      runDocs(root, ['semantic', 'index'], undefined, {
        createEmbeddingProvider: endpoint(dimensions),
      });

    expect((await index(8)).stdout).toEqual([expect.stringMatching(/^Index rebuilt: /)]);
    expect((await index(8)).stdout).toEqual([expect.stringMatching(/^Index current /)]);
    expect((await index(16)).stdout).toEqual([expect.stringMatching(/^Index rebuilt: /)]);
  });
});
