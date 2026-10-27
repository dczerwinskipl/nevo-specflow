// Linux integration (real Git, real Engine): `specs documents` over a real project, with no Runtime.
// Run through tools/dev/linux-test.sh; every test starts Git processes.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
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

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** A project with Git on, a work branch and the shipped definitions, plus one created Specification. */
async function project(gitEnabled = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-cli-documents-Ż ')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: ' + String(gitEnabled) + '\n',
  );
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
    'CLI documents',
    '--json',
  ]);
  const specId = (JSON.parse(created.out[0]!) as { specId: string }).specId;
  const dir = join(root, 'specs', 'active', 'cli-documents');
  return { root, specId, dir };
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

const docs = (cwd: string, args: string[], readStdin?: () => Promise<string>) =>
  cli(cwd, ['specs', 'documents', ...args], readStdin);

const json = <T>(outcome: Outcome): T => JSON.parse(outcome.out.at(-1)!) as T;

describe('specs documents against a real project', () => {
  it('adds a document, commits it at exit and reports the settled commit with status', async () => {
    const { root, specId, dir } = await project();
    const head = git(root, 'rev-parse', 'HEAD');
    const body = '# Notes\n';
    const added = await docs(
      root,
      ['add', specId, '--path', 'notes/plan.md', '--type', 'note', '--stdin', '--json'],
      () => Promise.resolve(body),
    );
    expect(added.exit, added.err.join('\n')).toBe(0);
    const result = json<{
      operationId: string;
      documents: { path: string; revision: string }[];
      commit: { state: string };
    }>(added);
    expect(result.documents).toMatchObject([{ path: 'notes/plan.md', revision: sha256(body) }]);
    // The write was acknowledged as pending; the drain at exit committed it.
    expect(result.commit.state).toBe('pending');
    expect(await readFile(join(dir, 'notes', 'plan.md'), 'utf8')).toBe(body);
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(head);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');

    const status = json<{ commit: { state: string; sha?: string } }>(
      await docs(root, ['status', result.operationId, '--json']),
    );
    expect(status.commit.state).toBe('committed');
  });

  it('with --wait prints the settled commit', async () => {
    const { root, specId } = await project();
    const added = await docs(root, ['folder', specId, 'research', '--wait', '--json']);
    expect(added.exit, added.err.join('\n')).toBe(0);
    expect(json<{ commit: { state: string } }>(added).commit.state).toBe('committed');
  });

  it('creates a document from a template of the archetype and lists it', async () => {
    const { root, specId, dir } = await project();
    const added = await docs(root, ['add', specId, '--template', 'decisions', '--wait', '--json']);
    expect(added.exit, added.err.join('\n')).toBe(0);
    expect(await readFile(join(dir, 'decisions.md'), 'utf8')).toContain(
      '# CLI documents - Decisions',
    );
    const listed = json<{ documents: { path: string; type?: string }[]; commits?: unknown }>(
      await docs(root, ['list', specId, '--json']),
    );
    expect(listed.documents.map((item) => item.path)).toContain('decisions.md');
  });

  it('refuses a stale revision with exit 1, a code and a JSON error', async () => {
    const { root, specId } = await project();
    const refused = await docs(
      root,
      ['save', specId, 'overview', '--expected-revision', 'stale', '--stdin', '--json'],
      () => Promise.resolve('x\n'),
    );
    expect(refused.exit).toBe(1);
    expect(json<{ error: { code: string } }>(refused).error.code).toBe(
      'DOCUMENT_REVISION_CONFLICT',
    );
    expect(refused.err.join('\n')).toContain('DOCUMENT_REVISION_CONFLICT');
  });

  it('saves with the revision read from list, renames, moves, classifies and deletes', async () => {
    const { root, specId, dir } = await project();
    const revisionOf = async (path: string) =>
      json<{ documents: { id: string; path: string; revision: string }[] }>(
        await docs(root, ['list', specId, '--json']),
      ).documents.find((item) => item.path === path);

    const overview = await revisionOf('overview.md');
    const saved = await docs(
      root,
      [
        'save',
        specId,
        overview!.id,
        '--expected-revision',
        overview!.revision,
        '--stdin',
        '--wait',
        '--json',
      ],
      () => Promise.resolve('# Replaced\n'),
    );
    expect(saved.exit, saved.err.join('\n')).toBe(0);
    expect(await readFile(join(dir, 'overview.md'), 'utf8')).toBe('# Replaced\n');

    await docs(root, ['add', specId, '--path', 'loose.md', '--stdin', '--wait'], () =>
      Promise.resolve('loose\n'),
    );
    const loose = await revisionOf('loose.md');
    const classified = await docs(root, [
      'classify',
      specId,
      loose!.id,
      '--type',
      'note',
      '--expected-revision',
      loose!.revision,
      '--wait',
      '--json',
    ]);
    expect(classified.exit, classified.err.join('\n')).toBe(0);

    const note = await revisionOf('loose.md');
    const moved = await docs(root, [
      'move',
      specId,
      '--document',
      note!.id,
      '--to',
      'archive-here',
      '--expected-revision',
      note!.revision,
      '--wait',
    ]);
    expect(moved.exit, moved.err.join('\n')).toBe(0);

    const renamed = await revisionOf('archive-here/loose.md');
    expect(
      (
        await docs(root, [
          'rename',
          specId,
          'tidy.md',
          '--document',
          renamed!.id,
          '--expected-revision',
          renamed!.revision,
          '--wait',
        ])
      ).exit,
    ).toBe(0);

    const tidy = await revisionOf('archive-here/tidy.md');
    expect(
      (
        await docs(root, [
          'delete',
          specId,
          '--document',
          tidy!.id,
          '--expected-revision',
          tidy!.revision,
          '--wait',
        ])
      ).exit,
    ).toBe(0);
    expect(await revisionOf('archive-here/tidy.md')).toBeUndefined();
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it('validates a complete Specification and flush of an idle project settles', async () => {
    const { root, specId } = await project();
    const valid = await docs(root, ['validate', specId, '--json']);
    expect(valid.exit, valid.err.join('\n')).toBe(0);
    expect(json<{ valid: boolean }>(valid).valid).toBe(true);
    expect((await docs(root, ['flush'])).exit).toBe(0);
    expect((await docs(root, ['flush', specId])).exit).toBe(0);
    expect((await docs(root, ['recover', '--confirmed-stopped'])).exit).toBe(0);
  });

  it('answers an unknown operation as a refusal, not a crash', async () => {
    const { root } = await project();
    const missing = await docs(root, ['status', randomUUID(), '--json']);
    expect(missing.exit).toBe(1);
    expect(json<{ error: { code: string } }>(missing).error.code).toBe(
      'DOCUMENT_OPERATION_NOT_FOUND',
    );
  });

  it('without Git writes at once and leaves nothing queued', async () => {
    const { root, specId } = await project(false);
    const added = await docs(root, ['folder', specId, 'plain', '--json']);
    expect(added.exit, added.err.join('\n')).toBe(0);
    expect(json<{ commit: { state: string } }>(added).commit.state).toBe('not-applicable');
  });
});
