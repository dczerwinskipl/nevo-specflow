// Linux integration (real Git, real Engine): `nevo-specflow commit` over a real project, with no
// Runtime. Run through tools/dev/linux-test.sh; every test starts Git processes.
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapProjectHome, installDefinitionsForTesting } from '@nevo/specflow-engine/testing';
import { CommanderError } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportedFailure, commanderExitCode } from '../src/exit-code';
import { createProgram } from '../src/program';

// A project per test, real Git and several commands each: seconds on Linux, minutes on a slow runner.
vi.setConfig({ testTimeout: 240_000 });

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

interface Outcome {
  readonly out: string[];
  readonly err: string[];
  readonly exit: number;
}

async function cli(
  cwd: string,
  args: string[],
  readStdin?: () => Promise<string>,
): Promise<Outcome> {
  const out: string[] = [];
  const err: string[] = [];
  const program = createProgram({
    cwd,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    ...(readStdin ? { readStdin } : {}),
  });
  try {
    await program.parseAsync(['node', 'nevo-specflow', ...args]);
    return { out, err, exit: 0 };
  } catch (error) {
    if (error instanceof CommanderError) return { out, err, exit: commanderExitCode(error) };
    if (error instanceof ReportedFailure) return { out, err, exit: error.exitCode };
    throw error;
  }
}

const json = <T>(outcome: Outcome): T => JSON.parse(outcome.out.at(-1)!) as T;

/** A project with Git on, auto-commit off for the documents, the shipped definitions and one Specification. */
async function project() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-cli-commit-')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'initial',
  );
  git(root, 'checkout', '-q', '-b', 'feature/work');
  await installDefinitionsForTesting(await bootstrapProjectHome(root));
  const created = await cli(root, [
    'specs',
    'create',
    '--archetype',
    'minimal',
    '--title',
    'CLI commit',
    '--json',
  ]);
  const specId = json<{ specId: string }>(created).specId;
  await mkdir(join(root, '.nevo', 'local'), { recursive: true });
  await writeFile(
    join(root, '.nevo', 'local', 'config.yaml'),
    'git:\n  commits:\n    auto:\n      documents: false\n',
  );
  return { root, specId, dir: join(root, 'specs', 'active', 'cli-commit') };
}

type Project = Awaited<ReturnType<typeof project>>;

/** Adds a document through the command line: with auto-commit off it is uncommitted at once. */
async function addDocument(p: Project, path: string, body: string): Promise<void> {
  const added = await cli(
    p.root,
    ['specs', 'documents', 'add', p.specId, '--path', path, '--type', 'note', '--stdin'],
    () => Promise.resolve(body),
  );
  expect(added.exit, added.err.join('\n')).toBe(0);
}

describe('commit against a real project', () => {
  it('lists the uncommitted changes and commits them with the message, then lists nothing', async () => {
    const p = await project();
    await addDocument(p, 'one.md', '# One\n');
    await addDocument(p, 'two.md', '# Two\n');
    const before = Number(git(p.root, 'rev-list', '--count', 'HEAD'));
    expect(git(p.root, 'status', '--porcelain', '--untracked-files=all')).not.toBe('');

    const status = await cli(p.root, ['commit', 'status', '--spec', 'cli-commit', '--json']);
    expect(status.exit, status.err.join('\n')).toBe(0);
    const view = json<{
      scope: string;
      ledgerRevision: string;
      policy: { documents: string; source: string };
      entries: { path: string; owner: string }[];
    }>(status);
    expect(view).toMatchObject({ scope: 'specification', policy: { documents: 'manual' } });
    expect(view.entries.map((entry) => entry.path)).toEqual([
      'specs/active/cli-commit/one.md',
      'specs/active/cli-commit/specification.yaml',
      'specs/active/cli-commit/two.md',
    ]);
    const lines = await cli(p.root, ['commit', 'status', '--spec', p.specId]);
    expect(lines.out.join('\n')).toContain('Uncommitted: 3 path(s)');

    const committed = await cli(p.root, [
      'commit',
      '--spec',
      'cli-commit',
      '-m',
      'Add the first notes',
      '-m',
      'They were written by the agent.',
      '--ledger-revision',
      view.ledgerRevision,
      '--json',
    ]);
    expect(committed.exit, committed.err.join('\n')).toBe(0);
    const result = json<{
      scope: string;
      specId: string;
      commit: { state: string; sha: string };
      paths: string[];
      remaining: { entries: number };
    }>(committed);
    expect(result).toMatchObject({
      scope: 'specification',
      specId: p.specId,
      commit: { state: 'committed' },
      remaining: { entries: 0 },
    });
    expect(result.paths).toEqual(view.entries.map((entry) => entry.path));
    expect(Number(git(p.root, 'rev-list', '--count', 'HEAD'))).toBe(before + 1);
    const message = git(p.root, 'log', '-1', '--format=%B');
    expect(message).toContain(
      'Add the first notes\n\nThey were written by the agent.\n\nNevo-Operation:',
    );
    expect(message).toContain('Nevo-Kind: manual-commit');
    expect(git(p.root, 'status', '--porcelain', '--untracked-files=all')).toBe('');

    const after = json<{ entries: unknown[] }>(
      await cli(p.root, ['commit', 'status', '--spec', 'cli-commit', '--json']),
    );
    expect(after.entries).toEqual([]);
  });

  it('refuses with exit 1, a code and a hint when a listed file was edited meanwhile', async () => {
    const p = await project();
    await addDocument(p, 'one.md', '# One\n');
    await appendFile(join(p.dir, 'one.md'), 'a person typed this\n');
    const before = git(p.root, 'rev-parse', 'HEAD');

    const refused = await cli(p.root, ['commit', '--spec', p.specId, '--json']);

    expect(refused.exit).toBe(1);
    expect(refused.err[0]).toContain('MANUAL_COMMIT_CONFLICT');
    expect(refused.err.join('\n')).toContain('Hint:');
    expect(
      json<{ error: { code: string; details: { paths: string[] } } }>(refused).error,
    ).toMatchObject({
      code: 'MANUAL_COMMIT_CONFLICT',
      details: { paths: ['specs/active/cli-commit/one.md'] },
    });
    expect(git(p.root, 'rev-parse', 'HEAD')).toBe(before);
    expect(await readFile(join(p.dir, 'one.md'), 'utf8')).toContain('a person typed this');
  });

  it('exits 1 with nothing uncommitted, 1 for an unknown Specification and 2 for a usage error', async () => {
    const p = await project();
    const empty = await cli(p.root, ['commit', '--spec', p.specId]);
    expect(empty.exit).toBe(1);
    expect(empty.err[0]).toContain('MANUAL_COMMIT_UNAVAILABLE');
    expect((await cli(p.root, ['commit', '--spec', 'no-such-spec'])).exit).toBe(1);
    expect((await cli(p.root, ['commit'])).exit).toBe(2);
    expect((await cli(p.root, ['commit', 'status'])).exit).toBe(2);
  });

  it('reads and commits the definitions from the command line', async () => {
    const p = await project();
    const status = await cli(p.root, ['commit', 'status', '--scope', 'definitions', '--json']);
    expect(status.exit, status.err.join('\n')).toBe(0);
    expect(json<{ scope: string; entries: unknown[] }>(status)).toMatchObject({
      scope: 'definitions',
      entries: [],
    });
    const nothing = await cli(p.root, ['commit', '--scope', 'definitions']);
    expect(nothing.exit).toBe(1);
    expect(nothing.err[0]).toContain('MANUAL_COMMIT_UNAVAILABLE');
  });
});
