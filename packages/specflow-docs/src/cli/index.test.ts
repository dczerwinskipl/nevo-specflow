import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runDocs } from '../../test/support/run-docs';

// A project without `.nevo/config.yaml`: every command runs on the defaults.
const root = mkdtempSync(join(tmpdir(), 'specflow-docs-cli-'));
mkdirSync(join(root, 'docs'));
writeFileSync(
  join(root, 'docs', 'guide.md'),
  '---\nid: guide\ntype: hub\ntitle: Guide\nstatus: current\nscope: anything\n---\n',
);
writeFileSync(
  join(root, 'docs', 'old.md'),
  '---\nid: old\ntype: hub\ntitle: Old guide\nstatus: superseded\nsuperseded_by: guide\n---\n',
);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('docs command', () => {
  it('--help lists the commands', async () => {
    const run = await runDocs(root, ['--help']);
    expect(run.exitCode).toBe(0);
    for (const name of ['list', 'find', 'get', 'context', 'check']) {
      expect(run.stdout.join('\n')).toContain(name);
    }
  });

  it('works without project configuration and writes the index under docs/', async () => {
    expect(await runDocs(root, ['check', '--write'])).toMatchObject({
      exitCode: 0,
      stdout: [
        'Wrote docs/index.generated.json and docs/index.generated.md',
        'OK — 2 documents, corpus valid, index current.',
      ],
    });
    expect((await runDocs(root, ['get', 'guide'])).stdout).toEqual([
      'guide — "Guide" [current]  docs/guide.md',
    ]);
  });

  it('get fails closed on an inactive document with a usage exit', async () => {
    const run = await runDocs(root, ['get', 'guide', 'old', '--json']);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toEqual([]);
    expect(run.stderr).toEqual([
      "get: inactive document id(s): 'old' (superseded; use 'guide' instead)",
    ]);
  });

  it('does not scan directories listed in docs.exclude', async () => {
    mkdirSync(join(root, 'docs', 'templates'));
    writeFileSync(join(root, 'docs', 'templates', 'page.md'), '# No frontmatter\n');
    const unexcluded = await runDocs(root, ['check']);
    mkdirSync(join(root, '.nevo'));
    writeFileSync(join(root, '.nevo', 'config.yaml'), 'docs:\n  exclude: [templates/]\n');
    const excluded = await runDocs(root, ['check']);
    rmSync(join(root, '.nevo'), { recursive: true });
    rmSync(join(root, 'docs', 'templates'), { recursive: true });
    expect(unexcluded.stderr).toContain(
      'docs/templates/page.md: missing frontmatter (every authored docs/**.md file needs it)',
    );
    expect(excluded).toMatchObject({ exitCode: 0, stderr: [] });
  });

  it('rejects a non-positive --limit as a usage error', async () => {
    expect((await runDocs(root, ['find', 'guide', '--limit', '0'])).exitCode).toBe(2);
  });

  it('fails with exit 1 when local configuration sets docs', async () => {
    mkdirSync(join(root, '.nevo', 'local'), { recursive: true });
    writeFileSync(join(root, '.nevo', 'local', 'config.yaml'), 'docs:\n  root: docs\n');
    const run = await runDocs(root, ['list']);
    rmSync(join(root, '.nevo'), { recursive: true });
    expect(run.exitCode).toBe(1);
    expect(run.stderr.join('\n')).toMatch(/project-owned and cannot be set locally/);
  });

  it('fails with exit 1 when the documentation root does not exist', async () => {
    const run = await runDocs(join(root, 'docs'), ['check', '--write']);
    expect(run.exitCode).toBe(1);
    expect(run.stderr.join('\n')).toMatch(/documentation root 'docs' does not exist/);
  });
});
