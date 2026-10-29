// Linux-only integration (real Git): the `definitions` commands over a real project.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapProjectHome } from '@nevo/specflow-engine/testing';
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

const IDENTITY = ['-c', 'user.name=SpecFlow Test', '-c', 'user.email=specflow@example.invalid'];

/** An initialised project: a committed config (the marker) with Git enabled or disabled. */
async function project(gitEnabled = true, extraGit = ''): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-definitions-cmd-Ż ')));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'trunk');
  await mkdir(join(root, '.nevo'), { recursive: true });
  await writeFile(join(root, '.gitignore'), '.nevo/local/\n');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: ' + String(gitEnabled) + '\n' + extraGit,
  );
  git(root, 'add', '.gitignore', '.nevo/config.yaml');
  git(root, ...IDENTITY, 'commit', '-qm', 'config');
  await bootstrapProjectHome(root);

  return root;
}

/** The JSON shapes the tests read (all optional: each command prints its own subset). */
interface Printed {
  projectHome?: string;
  written: string[];
  commit?: { paths: string[] };
  definitions: { id: string }[];
  reports: { hasErrors: boolean; problems: unknown[] }[];
  state?: string;
  id?: string;
}

function command(cwd: string) {
  const output: string[] = [];
  const program = createProgram({
    cwd,
    stdout: (line) => output.push(line),
    stderr: () => undefined,
  });
  const run = (args: string[]) => program.parseAsync(['node', 'nevo-specflow', ...args]);

  return {
    run,
    output,
    json: () => JSON.parse(output.at(-1) ?? 'null') as Printed,
  };
}

const BROKEN = 'kind: specification-archetype\n: [broken';

describe('definitions install', () => {
  it('installs and commits the shipped definitions, and is idempotent', async () => {
    const root = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const cli = command(root);
    await cli.run(['definitions', 'install', '--json']);
    const first = cli.json();
    expect(first.projectHome).toBe(root);
    expect(first.written).toHaveLength(13);
    expect(first.commit?.paths).toHaveLength(13);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');

    const again = command(root);
    await again.run(['definitions', 'install', '--add-missing', '--json']);
    expect(again.json().written).toEqual([]);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
  });

  it('refuses a bare install on a project that has definitions, names the ways to add and fails', async () => {
    const root = await project();
    await command(root).run(['definitions', 'install']);
    const second = command(root);
    await expect(second.run(['definitions', 'install'])).rejects.toThrow(/--add-missing/u);
    expect(second.output.join('\n')).toContain('Project Home: ' + root);
  });

  it('adds a deleted definition only when it is named, and never overwrites without --force', async () => {
    const root = await project();
    await command(root).run(['definitions', 'install']);
    await rm(join(root, '.nevo/definitions/specification-archetype/minimal.yaml'));
    git(root, ...IDENTITY, 'commit', '-qam', 'owner removed minimal');
    const file = join(root, '.nevo/definitions/document-type/note.yaml');
    await writeFile(file, 'edited by the owner\n');
    git(root, ...IDENTITY, 'commit', '-qam', 'owner edited note');

    const cli = command(root);
    await cli.run(['definitions', 'install', 'specification-archetype/minimal', '--json']);
    expect(cli.json().written).toContain('specification-archetype/minimal.yaml');
    expect(await readFile(file, 'utf8')).toBe('edited by the owner\n');

    await command(root).run(['definitions', 'install', 'document-type/note', '--force']);
    expect(await readFile(file, 'utf8')).not.toBe('edited by the owner\n');
  });

  it('dry run writes and commits nothing and prints the plan', async () => {
    const root = await project();
    const head = git(root, 'rev-parse', 'HEAD');
    const cli = command(root);
    await cli.run(['definitions', 'install', '--dry-run']);
    expect(cli.output.join('\n')).toContain('Dry run: nothing was written.');
    expect(cli.output.join('\n')).toContain('create document-type/overview.yaml');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it('refuses on a protected branch before writing, with the protection code', async () => {
    const root = await project(true, '  commits:\n    protectedBranches: [trunk]\n');
    const refusal = await command(root)
      .run(['definitions', 'install'])
      .then(
        () => undefined,
        (error: unknown) => error as Error & { code?: string },
      );
    expect(refusal?.code).toBe('BRANCH_PROTECTED');
    // It names the branch and every way out.
    expect(refusal?.message).toContain("Nevo does not commit the definitions on 'trunk'");
    expect(refusal?.message).toContain('git switch -c nevo-specflow/definitions');
    expect(refusal?.message).toContain(
      "remove 'trunk' from git.commits.protectedBranches in .nevo/config.yaml",
    );
    expect(refusal?.message).toContain('Nothing was written.');
    await expect(
      readFile(join(root, '.nevo/definitions/document-type/overview.yaml')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes without committing when Git is disabled', async () => {
    const root = await project(false);
    const head = git(root, 'rev-parse', 'HEAD');
    const cli = command(root);
    await cli.run(['definitions', 'install', '--json']);
    expect(cli.json().commit).toBeUndefined();
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('treats a malformed target as a usage error and names the form', async () => {
    const root = await project();
    await expect(command(root).run(['definitions', 'install', 'nonsense'])).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      message: expect.stringContaining('<kind>/<id>') as unknown,
    });
  });

  it('rejects naming definitions together with --add-missing as a usage error', async () => {
    const root = await project();
    await expect(
      command(root).run(['definitions', 'install', 'document-type/note', '--add-missing']),
    ).rejects.toMatchObject({ code: 'commander.invalidArgument' });
  });
});

describe('definitions list, show and validate', () => {
  it('lists, shows and validates an installed project', async () => {
    const root = await project();
    await command(root).run(['definitions', 'install']);

    const list = command(root);
    await list.run(['definitions', 'list', '--kind', 'specification-archetype', '--json']);
    expect(list.json().definitions.map((item) => item.id)).toEqual([
      'architecture',
      'feature',
      'minimal',
    ]);

    const human = command(root);
    await human.run(['definitions', 'list']);
    expect(human.output).toContain('Project Home: ' + root);
    expect(human.output).toContain('specification-archetype/feature v1 - Feature');

    const show = command(root);
    await show.run(['definitions', 'show', 'specification-archetype/feature', '--json']);
    expect(show.json()).toMatchObject({ state: 'valid', id: 'feature' });

    const validate = command(root);
    await validate.run(['definitions', 'validate']);
    expect(validate.output.at(-1)).toBe('OK');
  });

  it('prints the problems of a rejected file and fails from validate and show', async () => {
    const root = await project();
    await command(root).run(['definitions', 'install']);
    await writeFile(join(root, '.nevo/definitions/specification-archetype/feature.yaml'), BROKEN);

    const validate = command(root);
    await expect(validate.run(['definitions', 'validate'])).rejects.toThrow(/errors/u);
    expect(validate.output.join('\n')).toContain('specification-archetype/feature.yaml');

    const json = command(root);
    await expect(json.run(['definitions', 'validate', '--json'])).rejects.toThrow(/errors/u);
    expect(json.json().reports[0]?.hasErrors).toBe(true);

    const show = command(root);
    await expect(
      show.run(['definitions', 'show', 'specification-archetype/feature']),
    ).rejects.toThrow(/rejected/u);

    await expect(command(root).run(['definitions', 'show', 'document-type/ghost'])).rejects.toThrow(
      /not defined/u,
    );
  });

  it('validates a definitions folder given by path, the same way as the project', async () => {
    const root = await project();
    await command(root).run(['definitions', 'install']);
    await writeFile(join(root, '.nevo/definitions/specification-archetype/feature.yaml'), BROKEN);

    const byProject = command(root);
    await expect(byProject.run(['definitions', 'validate', '--json'])).rejects.toBeDefined();
    const byPath = command(root);
    await expect(
      byPath.run(['definitions', 'validate', join(root, '.nevo/definitions'), '--json']),
    ).rejects.toBeDefined();
    expect(byPath.json().reports[0]?.problems).toEqual(byProject.json().reports[0]?.problems);
  });
});
