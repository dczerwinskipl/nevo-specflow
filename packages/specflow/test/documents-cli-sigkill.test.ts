// Linux integration (real Git, real Engine, a real CLI process killed with SIGKILL): the one-shot
// drain at the exit of a `specs documents` command. The command acknowledges the write, then commits
// at exit; when Git hangs inside the commit and the whole process group is killed, the document is on
// disk and journaled, the repository holds an orphan index.lock, and a later `flush` commits it once.
// Run through tools/dev/linux-test.sh.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { bootstrapProjectHome, installDefinitionsForTesting } from '@nevo/specflow-engine/testing';
import { CommanderError } from 'commander';
import { afterEach, describe, expect, it } from 'vitest';

import { ReportedFailure, commanderExitCode } from '../src/exit-code';
import { createProgram } from '../src/program';
import { onLinux } from './support/platform';

const roots: string[] = [];
const children: { kill: (signal: NodeJS.Signals) => boolean }[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

async function project() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-cli-sigkill-')));
  roots.push(root);
  git(root, 'init', '-q');
  git(root, 'config', '--local', 'core.autocrlf', 'false');
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
    'CLI kill',
    '--json',
  ]);
  const specId = (JSON.parse(created.out[0]!) as { specId: string }).specId;
  return { root, specId, dir: join(root, 'specs', 'active', 'cli-kill') };
}

interface Outcome {
  readonly out: string[];
  readonly err: string[];
  readonly exit: number;
}

async function cli(cwd: string, args: string[]): Promise<Outcome> {
  const out: string[] = [];
  const err: string[] = [];
  const program = createProgram({
    cwd,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
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

/** The command in an independent Node/Vitest process, as a CLI run of its own. */
function spawnCli(cwd: string, args: string[], resultFile: string) {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const vitestEntry = resolve(
    dirname(fileURLToPath(import.meta.resolve('vitest'))),
    '..',
    'vitest.mjs',
  );
  const child = spawn(
    process.execPath,
    [
      vitestEntry,
      'run',
      'test/fixtures/documents-cli-worker.test.ts',
      '--maxWorkers=1',
      '--testTimeout=240000',
    ],
    {
      cwd: packageRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NEVO_CLI_WORKER: '1',
        NEVO_CLI_WORKER_CWD: cwd,
        NEVO_CLI_WORKER_ARGS: JSON.stringify(args),
        NEVO_CLI_WORKER_RESULT: resultFile,
      },
    },
  );
  let log = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      log += chunk;
    });
  }
  children.push(child);
  const done = new Promise<number | null>((resolveDone, reject) => {
    child.once('error', reject);
    child.once('close', resolveDone);
  });
  return { child, done, log: () => log };
}

async function waitForFile(path: string, done: Promise<unknown>, log: () => string) {
  let exited = false;
  void done.then(() => {
    exited = true;
  });
  for (let tries = 0; tries < 2000; tries += 1) {
    try {
      await access(path);
      return;
    } catch {
      if (exited) throw new Error('The CLI process ended before the hang: ' + log());
      await sleep(30);
    }
  }
  throw new Error('The awaited file never appeared: ' + path + '\n' + log());
}

describe.skipIf(!onLinux)('the drain at exit of a CLI command killed inside git commit', () => {
  it('leaves the document journaled; flush commits it once the orphan index.lock is gone', async () => {
    const { root, specId, dir } = await project();
    const gitDir = join(root, '.git');
    const flag = join(gitDir, 'hang-flag');
    const groupFile = join(gitDir, 'filter.group');
    const script = join(gitDir, 'hang-clean.sh');
    // Hangs only inside a Git mutation (it holds index.lock) and only while the flag exists.
    await writeFile(
      script,
      [
        `if [ -e "${flag}" ] && [ -e "${gitDir}/index.lock" ]; then`,
        `  ps -o pgid= -p $$ | tr -d ' ' > "${groupFile}.tmp"; mv "${groupFile}.tmp" "${groupFile}"`,
        '  sleep 600 & wait',
        'fi',
        'cat',
        '',
      ].join('\n'),
    );
    git(root, 'config', 'filter.hang.clean', `sh "${script}"`);
    await writeFile(join(dir, '.gitattributes'), '*.md filter=hang\n');
    git(root, 'add', '--', 'specs');
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'filter');
    const head = git(root, 'rev-parse', 'HEAD');

    const body = '# Plan\n\nWritten by a CLI that is killed at exit.\n';
    const source = join(tmpdir(), 'cli-kill-body-' + randomUUID() + '.md');
    roots.push(source);
    await writeFile(source, body);
    await writeFile(flag, '');

    const result = join(tmpdir(), 'cli-kill-result-' + randomUUID() + '.json');
    roots.push(result, result + '.pid');
    const run = spawnCli(
      root,
      [
        'specs',
        'documents',
        'add',
        specId,
        '--path',
        'plan.md',
        '--type',
        'note',
        '--content-file',
        source,
        '--json',
      ],
      result,
    );
    await waitForFile(groupFile, run.done, run.log);
    const group = Number((await readFile(groupFile, 'utf8')).trim());
    expect(group).toBeGreaterThan(1);
    expect(group).not.toBe(
      Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' })),
    );
    // The runner first (it would record the failure of Git), then the group of Git and its filter.
    process.kill(Number(await readFile(result + '.pid', 'utf8')), 'SIGKILL');
    process.kill(-group, 'SIGKILL');
    expect(await run.done).not.toBe(0);
    await rm(flag);

    // The write was acknowledged before the commit: the document is on disk, the commit is not.
    expect(await readFile(join(dir, 'plan.md'), 'utf8')).toBe(body);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    await access(join(gitDir, 'index.lock'));

    // While the lock stays the commit cannot be made: nothing is lost and nothing is invented.
    const blocked = await cli(root, ['specs', 'documents', 'flush', '--wait-ms', '300']);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(blocked.exit).toBeGreaterThanOrEqual(0);

    // The operator removes the orphan lock; a later command finishes the work exactly once.
    await rm(join(gitDir, 'index.lock'));
    for (let pass = 0; pass < 3 && git(root, 'rev-parse', 'HEAD') === head; pass += 1) {
      await cli(root, ['specs', 'documents', 'recover', '--confirmed-stopped']);
      await cli(root, ['specs', 'documents', 'flush', '--wait-ms', '300']);
    }
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(head);
    expect(git(root, 'rev-list', '--count', `${head}..HEAD`)).toBe('1');
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(git(root, 'show', 'HEAD:specs/active/cli-kill/plan.md')).toBe(body.trim());
  }, 240000);
});
