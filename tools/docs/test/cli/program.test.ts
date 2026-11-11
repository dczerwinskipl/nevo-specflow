// The launcher in-process over a fixture project: the product adapter with this repository's hints
// and ADR rules, plus `adr new`.

import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CommanderError } from 'commander';
import { afterAll, describe, expect, it } from 'vitest';

import { createProgram } from '../../src/cli/program.js';
import { createFixtureProject, fm } from '../support/fixture.js';

const project = createFixtureProject();
afterAll(() => rmSync(project.root, { recursive: true, force: true }));

async function run(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = createProgram({
    resolveProject: () => Promise.resolve(project),
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    env: {},
  });
  try {
    await program.parseAsync(['node', 'nevo-docs', ...args]);

    return { code: 0, stdout, stderr };
  } catch (err) {
    if (err instanceof CommanderError) {
      return { code: err.code === 'commander.helpDisplayed' ? 0 : 2, stdout, stderr };
    }

    return { code: 1, stdout, stderr: [...stderr, String(err)] };
  }
}

describe('nevo-docs launcher', () => {
  it('--help lists the product commands and adr', async () => {
    const { code, stdout } = await run(['--help']);
    expect(code).toBe(0);
    for (const cmd of ['list', 'find', 'get', 'context', 'check', 'search', 'semantic', 'adr']) {
      expect(stdout.join('\n')).toContain(cmd);
    }
  });

  it('check --write skips the excluded templates and quotes the pnpm command', async () => {
    expect(await run(['check', '--write'])).toMatchObject({ code: 0, stderr: [] });
    const extra = join(project.root, 'docs', 'extra.md');
    writeFileSync(extra, fm({ id: 'extra', type: 'hub', title: 'Extra', status: 'current' }));
    const stale = await run(['check']);
    rmSync(extra);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain('Run `pnpm docs:check --write` to regenerate the index.');
  });

  it('applies the repository ADR rules', async () => {
    const adr = join(project.root, 'docs', 'architecture', 'decisions', '0003-gap.md');
    writeFileSync(
      adr,
      fm({ id: 'adr.0003-gap', type: 'adr', title: 'Gap', status: 'draft', date: '2026-09-06' }),
    );
    const result = await run(['check']);
    rmSync(adr);
    expect(result.stderr).toContain('ADR numbering has a gap or duplicate near 0003');
  });

  it('search answers lexically and points at pnpm docs:get', async () => {
    const { code, stdout } = await run(['search', 'which decision is about widgets']);
    expect(code).toBe(0);
    expect(stdout.join('\n')).toMatch(/lexical/);
    expect(stdout.join('\n')).toContain('pnpm docs:get');
  });

  it('adr new --dry-run prints a YAML-safe draft and writes nothing', async () => {
    const { code, stdout } = await run(['adr', 'new', 'Colons: everywhere', '--dry-run']);
    expect(code).toBe(0);
    expect(stdout.join('\n')).toContain(
      '# would create docs/architecture/decisions/0002-colons-everywhere.md',
    );
    expect(stdout.join('\n')).toContain('status: draft');
  });
});
