// Linux integration (real Git, real Engine): `tasks` and `workflow` over a real project, with no
// Runtime and no Specification run. Run through tools/dev/linux-test.sh.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  admitWorkspaceExecution,
  bootstrapProjectHome,
  installDefinitionsForTesting,
  markWorkspaceExecutionDispatched,
  openSpecFlowEngine,
  settleWorkspaceExecution,
} from '@nevo/specflow-engine/testing';
import { CommanderError } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportedFailure, commanderExitCode } from '../src/exit-code';
import { createProgram } from '../src/program';

vi.setConfig({ testTimeout: 240_000 });

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function project() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-cli-tasks-')));
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

  return root;
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
    osUser: 'tester',
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    readStdin: () => Promise.resolve('# Build\n\nImplement it.\n'),
  });
  try {
    await program.parseAsync(['node', 'nevo-specflow', ...args]);

    return { out, err, exit: 0 };
  } catch (error) {
    if (error instanceof CommanderError) {
      return { out, err, exit: commanderExitCode(error) };
    }

    if (error instanceof ReportedFailure) {
      return { out, err, exit: error.exitCode };
    }

    throw error;
  }
}

const json = <T>(outcome: Outcome): T => JSON.parse(outcome.out.at(-1)!) as T;

describe('tasks and workflow against a real project', () => {
  it('creates, approves, starts and finishes a Task without a Specification run', async () => {
    const root = await project();
    const created = await cli(root, [
      'specs',
      'create',
      '--archetype',
      'minimal',
      '--title',
      'CLI tasks',
      '--json',
    ]);
    const { specId } = json<{ specId: string }>(created);

    const noWait = await cli(root, [
      'workflow',
      'reevaluate-wait',
      specId,
      '--step',
      'implementation',
      '--attempt',
      '1',
    ]);
    expect(noWait.exit).toBe(1);
    expect(noWait.err.join('\n')).toContain('WORKFLOW_SPECIFICATION_NOT_STARTED');

    const task = await cli(root, [
      'tasks',
      'create',
      specId,
      '--id',
      'build',
      '--title',
      'Build it',
      '--type',
      'implementation',
      '--context',
      'spec-doc:overview',
      '--stdin',
      '--json',
    ]);
    expect(task.exit).toBe(0);
    const { revision } = json<{ revision: string }>(task);

    // A draft cannot start: the refusal is a coded exit 1.
    const early = await cli(root, ['workflow', 'start', specId, '--task', 'build']);
    expect(early.exit).toBe(1);
    expect(early.err.join('\n')).toContain('WORKFLOW_TASK_BLOCKED');

    // A stale revision is refused.
    const stale = await cli(root, [
      'tasks',
      'edit',
      specId,
      'build',
      '--expected-revision',
      'stale',
      '--title',
      'Other',
    ]);
    expect(stale.exit).toBe(1);
    expect(stale.err.join('\n')).toContain('WORKFLOW_TASK_REVISION_CONFLICT');
    expect(
      (
        await cli(root, [
          'tasks',
          'edit',
          specId,
          'build',
          '--expected-revision',
          revision,
          '--title',
          'Build it well',
        ])
      ).exit,
    ).toBe(0);

    expect((await cli(root, ['tasks', 'status', specId, 'build', 'approve'])).exit).toBe(0);

    const actions = json<{
      actions: { start?: { step: string; expectedWorkflowRevision?: string } };
    }>(await cli(root, ['workflow', 'actions', specId, '--task', 'build', '--json']));
    expect(actions.actions.start?.step).toBe('implement');

    const started = await cli(root, [
      'workflow',
      'start',
      specId,
      '--task',
      'build',
      '--expected-workflow-revision',
      actions.actions.start!.expectedWorkflowRevision!,
      '--json',
    ]);
    expect(started.exit).toBe(0);
    expect(json<{ kind: string }>(started).kind).toBe('started');

    // The context of the active attempt: documents and the Task context as references (read-only).
    const context = json<{
      agent: {
        documents: { id: string; path: string }[];
        taskContext: { entries: { ref: string; sha256?: string }[] };
      };
    }>(await cli(root, ['workflow', 'context', specId, '--task', 'build', '--json']));
    expect(context.agent.documents.map((document) => document.id)).toContain('overview');
    expect(context.agent.taskContext.entries[0]).toMatchObject({ ref: 'overview' });
    expect(context.agent.taskContext.entries[0]?.sha256).toMatch(/^[0-9a-f]{64}$/u);

    const finished = await cli(root, [
      'workflow',
      'finish',
      specId,
      '--task',
      'build',
      '--step',
      'implement',
      '--attempt',
      '1',
      '--json',
    ]);
    expect(finished.exit).toBe(0);
    expect(json<{ transition: string }>(finished).transition).toBe('implemented');

    // Repeating the same finish (a lost response) returns the recorded result.
    const repeated = await cli(root, [
      'workflow',
      'finish',
      specId,
      '--task',
      'build',
      '--step',
      'implement',
      '--attempt',
      '1',
      '--json',
    ]);
    expect(repeated.exit).toBe(0);
    expect(json<{ replayed?: boolean }>(repeated).replayed).toBe(true);

    // The recorded actor is the local owner built by the CLI, never one from an option.
    const inspected = json<{
      task: { record: { run: { attempts: { actor: unknown }[] } } };
    }>(await cli(root, ['tasks', 'inspect', specId, 'build', '--json']));
    expect(inspected.task.record.run.attempts[0]?.actor).toEqual({
      class: 'human',
      details: { actorId: 'local:tester', trust: 'local' },
    });

    // The Task's text is read and saved through the documents command with the Task scope.
    const read = await cli(root, ['specs', 'documents', 'read', specId, 'task', '--task', 'build']);
    expect(read.out.join('\n')).toContain('Implement it.');
  });

  // F05: the offline owner CLI (`local:<os-user>`) is a writer like any other while an agent Turn
  // holds the project; the refusal names the Session, and reads keep working.
  it('refuses the local owner while an agent Turn holds the project, naming its Session', async () => {
    const root = await project();
    const { specId } = json<{ specId: string }>(
      await cli(root, ['specs', 'create', '--archetype', 'minimal', '--title', 'Held', '--json']),
    );
    const engine = await openSpecFlowEngine({ cwd: root });
    const intent = { operationId: randomUUID(), ownerId: randomUUID(), binding: 'a'.repeat(64) };
    await admitWorkspaceExecution(engine, intent);
    await markWorkspaceExecutionDispatched(engine, intent);

    const refused = await cli(root, [
      'tasks',
      'create',
      specId,
      '--id',
      'held',
      '--title',
      'Held',
      '--type',
      'implementation',
      '--json',
    ]);
    expect(refused.exit).toBe(1);
    expect(refused.err.join('\n')).toContain(
      `WORKFLOW_SPECIFICATION_BUSY: An agent Session Turn (Session ${intent.ownerId})`,
    );
    expect(json<{ error: unknown }>(refused).error).toMatchObject({
      code: 'WORKFLOW_SPECIFICATION_BUSY',
      cause: 'agent-turn',
      sessionId: intent.ownerId,
    });
    expect((await cli(root, ['tasks', 'list', specId])).exit).toBe(0);

    await settleWorkspaceExecution(engine, intent, {
      invocationId: intent.operationId,
      process: 'stopped',
      outcome: 'completed',
    });
    const after = await cli(root, [
      'tasks',
      'create',
      specId,
      '--id',
      'held',
      '--title',
      'Held',
      '--type',
      'implementation',
    ]);
    expect(after.exit, after.err.join('\n')).toBe(0);
  });
});

describe('workflow-state commits of a CLI command', () => {
  it('with automatic commits on, a Task create and a step start leave nothing uncommitted', async () => {
    const root = await project();
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: true\n  commits:\n    auto:\n      documents: true\n',
    );
    git(root, 'add', '.nevo/config.yaml');
    git(
      root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'auto-commit documents',
    );
    const { specId } = json<{ specId: string }>(
      await cli(root, ['specs', 'create', '--archetype', 'minimal', '--title', 'Auto', '--json']),
    );
    const status = () =>
      execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: root,
        encoding: 'utf8',
      });
    expect(status()).toBe('');

    const task = await cli(root, [
      'tasks',
      'create',
      specId,
      '--id',
      'build',
      '--title',
      'Build it',
      '--type',
      'implementation',
    ]);
    expect(task.exit).toBe(0);
    // The command commits what it wrote before it exits, as the Runtime's queue does, so the queue
    // can batch the Task index and run records at all.
    expect(task.err).toEqual([]);
    expect(status()).toBe('');

    const started = await cli(root, ['workflow', 'start', specId]);
    expect(started.exit).toBe(0);
    expect(started.err).toEqual([]);
    expect(status()).toBe('');
    expect(
      execFileSync('git', ['log', '--format=%s', '-2'], { cwd: root, encoding: 'utf8' }),
    ).toMatch(
      /^spec\(workflow\): start step .* in auto\nspec\(workflow\): create task build in auto/u,
    );
  });
});
