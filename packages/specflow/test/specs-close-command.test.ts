import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { bootstrapProjectHome, createSpecificationForTesting } from '@nevo/specflow-engine/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { createProgram } from '../src/program';

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

function commitStaged(cwd: string, message: string): void {
  git(
    cwd,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    message,
  );
}

/** A linked Specification worktree, registered under a project with an integration target. */
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-cli-close-Ż ')));
  roots.push(root);
  git(root, 'init', '-q');
  await mkdir(join(root, '.nevo'));
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(join(root, '.nevo/config.yaml'), 'runtime: {}\ngit:\n  enabled: true\n');
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  commitStaged(root, 'initial');
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'target branch');

  const engine = await bootstrapProjectHome(root);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'CLI finish after external merge',
    created: '2026-11-20',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'new-worktree', baseRef: 'HEAD' },
  });
  roots.push(dirname(spec.workspaceRoot));
  git(
    spec.workspaceRoot,
    'add',
    '--',
    spec.relativeManifestPath,
    'specs/active/' + spec.slug + '/overview.md',
  );
  // Create commits its own scaffold when git.enabled; only commit what is still staged.
  if (git(spec.workspaceRoot, 'diff', '--cached', '--name-only') !== '') {
    commitStaged(spec.workspaceRoot, 'spec source commit');
  }

  return { root, spec };
}

function command(cwd: string) {
  const output: string[] = [];
  const program = createProgram({
    cwd,
    stdout: (line) => output.push(line),
    stderr: () => undefined,
  });
  const run = (args: string[]) => program.parseAsync(['node', 'nevo-specflow', 'specs', ...args]);

  return { run, output };
}

describe('#157 CLI --finish-after-external-merge', () => {
  it('specs worktree close --finish-after-external-merge finishes without a new merge commit', async () => {
    const { root, spec } = await fixture();

    // "Externally" squash-merge the Spec's folder into the destination, as a GitHub PR would.
    const sourcePath = join(spec.workspaceRoot, 'specs', 'active', spec.slug);
    const destinationPath = join(root, 'specs', 'active', spec.slug);
    await mkdir(join(root, 'specs', 'active'), { recursive: true });
    await cp(sourcePath, destinationPath, { recursive: true });
    git(root, 'add', '-A', '--', 'specs/active/' + spec.slug);
    commitStaged(root, 'simulate external squash merge');
    const squashedHead = git(root, 'rev-parse', 'HEAD');

    const cli = command(root);
    await cli.run([
      'worktree',
      'close',
      spec.specId,
      '--finish-after-external-merge',
      '--yes',
      '--json',
    ]);
    const result = JSON.parse(cli.output[0]!) as { status: string };
    expect(result.status).toBe('completed');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(squashedHead);
  }, 120000);

  it('specs worktree close --finish-after-external-merge --preview pins the request field without writing', async () => {
    const { root, spec } = await fixture();
    const sourceBranch = git(spec.workspaceRoot, 'symbolic-ref', '--short', 'HEAD');
    const targetBranch = git(root, 'symbolic-ref', '--short', 'HEAD');
    const cli = command(root);
    await cli.run([
      'worktree',
      'close',
      spec.specId,
      '--finish-after-external-merge',
      '--preview',
      '--json',
    ]);
    const beforeHead = git(root, 'rev-parse', 'HEAD');
    const plan = JSON.parse(cli.output[0]!) as {
      merge: { status: string; reason?: string; sourceBranch?: string; targetBranch?: string };
    };
    // The preview must describe what the real Close will do with this flag (no merge at all),
    // never an ordinary merge: #157's finish-after-external-merge preview gap.
    expect(plan.merge).toEqual({
      status: 'not-integrated',
      reason: 'already-merged-externally',
      sourceBranch,
      targetBranch,
    });
    // No mutation from a preview: the external-merge proof never ran, HEAD is unchanged.
    expect(git(root, 'rev-parse', 'HEAD')).toBe(beforeHead);
  }, 60000);

  it('specs worktree close --preview without the flag still previews the ordinary merge', async () => {
    const { root, spec } = await fixture();
    const sourceBranch = git(spec.workspaceRoot, 'symbolic-ref', '--short', 'HEAD');
    const targetBranch = git(root, 'symbolic-ref', '--short', 'HEAD');
    const cli = command(root);
    await cli.run(['worktree', 'close', spec.specId, '--preview', '--json']);
    const plan = JSON.parse(cli.output[0]!) as {
      merge: { status: string; sourceBranch?: string; targetBranch?: string };
    };
    expect(plan.merge).toMatchObject({ status: 'integrates', sourceBranch, targetBranch });
  }, 60000);
});
