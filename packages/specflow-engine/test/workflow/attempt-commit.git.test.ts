// Integration (real project, real Git, automatic commits off): the one commit of an agent attempt
// (D15). One checkout for the file: the attempts' ledger entries and declared files, and other
// authors' ledger entries beside them.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import { recordLedgerEntries } from '../../src/specs/durable';
import { ManualCommitInterrupted } from '../../src/specs/manual-commit';
import { readUncommittedHold } from '../../src/specs/uncommitted';
import { commitAgentAttempt } from '../../src/workflow/agent/finalize/attempt-commit/run';
import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  installProjectDefinitions,
  openAgentAttempts,
  runAgentPostActions,
  retryAgentPostActions,
  withProjectControlLock,
  type AgentAttemptDependencies,
  type SpecFlowEngine,
} from '../../src/testing';
import {
  agentPostActionId,
  type AgentAttemptJournal,
} from '../../src/workflow/agent/journal/model';
import { commitStaged, createGitTestProject, git } from '../support/git-project';

const ATTEMPT_ID = '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02';
const INVOCATION = '3b2e8c74-8c65-4e77-9f5a-3d9c7f4bae03';
const AT = '2026-11-21T10:00:00.000Z';
const agent = { class: 'agent', details: { provider: 'claude', model: 'opus' } } as const;

let root: string;
let engine: SpecFlowEngine;
let dependencies: AgentAttemptDependencies;
let specId: string;
let directory: string;

async function put(path: string, content: string): Promise<string> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);

  return sha256Hex(content);
}

/** A ledger entry of the Specification, made by the agent's Turn or (no `executionId`) by the owner. */
async function recorded(path: string, content: string, executionId?: string): Promise<void> {
  await record(path, await put(path, content), executionId);
}

async function record(path: string, postSha256: string | null, executionId?: string) {
  await recordLedgerEntries(
    engine.context,
    {
      projectId: engine.context.project.projectId,
      workspaceId: engine.workspace.workspaceId,
      workspaceRoot: root,
      owner: { kind: 'specification', id: specId },
    },
    {
      operationId: randomUUID(),
      reason: 'auto-commit-off',
      recordedAt: AT,
      paths: [{ path, postSha256 }],
      ...(executionId !== undefined ? { executionId } : {}),
      branch: git(root, 'branch', '--show-current'),
      head: git(root, 'rev-parse', 'HEAD'),
    },
  );
}

/** A finished attempt of `step` whose attempt commit waits, published in the local journal. */
async function finishedAttempt(
  attemptId: string,
  invocationId: string,
  step: string,
  declared: { readonly path: string; readonly sha256: string | null }[],
): Promise<AgentAttemptJournal> {
  const journal: AgentAttemptJournal = {
    version: 1,
    operationId: attemptId,
    subject: { kind: 'specification', specId },
    step,
    attempt: 1,
    actor: agent,
    workspaceId: engine.workspace.workspaceId,
    turns: [{ invocationId, turnId: 'turn-1', boundAt: AT, finalizedAt: AT }],
    proposal: {
      requestDigest: 'a'.repeat(64),
      invocationId,
      actor: agent,
      input: {},
      ...(declared.length > 0 ? { changes: { paths: declared.map((entry) => entry.path) } } : {}),
      transition: 'agreed',
      submittedAt: AT,
      state: 'finalized',
    },
    postActions: [
      {
        kind: 'attempt-commit',
        operationId: agentPostActionId(attemptId, 'attempt-commit'),
        stepTitle: 'Requirements',
        state: 'pending',
        declared,
      },
    ],
  };
  await withProjectControlLock(engine.context, () => dependencies.journal.publish(journal));

  return journal;
}

const commitsOf = (attemptId: string) =>
  git(root, 'log', '--format=%H', `--grep=Nevo-Attempt: ${attemptId}`).split('\n').filter(Boolean);

const dirty = () =>
  git(root, 'status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
    .sort();

beforeAll(async () => {
  root = await createGitTestProject(
    'specflow-attempt-commit-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  engine = await bootstrapProjectHome(root);
  await installProjectDefinitions(engine);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Attempt commit',
    created: '2026-11-21',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  specId = spec.specId;
  directory = 'specs/active/' + spec.slug;
  await put('src/app.ts', 'export const app = 1;\n');
  git(root, 'add', '-A');
  commitStaged(root, 'fixture');

  const opened = await openAgentAttempts(engine);
  // The attempt's last Turn is settled (its finalize ran); its post action waits.
  dependencies = {
    ...opened,
    finalize: { ...opened.finalize, claim: () => Promise.resolve({ phase: 'settled' as const }) },
  };
}, 600_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
});

it('commits exactly the attempt, refuses a file edited after publication, and commits once on retry', async () => {
  const notes = `${directory}/notes.md`;
  const foreign = `${directory}/owner.md`;
  await recorded(notes, '# Notes by the agent\n', INVOCATION);
  await recorded(foreign, '# The owner wrote this\n');
  const published = await put('src/app.ts', 'export const app = 2;\n');
  await finishedAttempt(ATTEMPT_ID, INVOCATION, 'requirements', [
    { path: 'src/app.ts', sha256: published },
  ]);
  const head = git(root, 'rev-parse', 'HEAD');

  // Someone edits the declared file after the step was published: nothing is committed.
  await put('src/app.ts', 'export const app = 3;\n');
  const [refused] = await runAgentPostActions(dependencies, ATTEMPT_ID);
  expect(refused).toMatchObject({
    action: 'attempt-commit',
    status: 'failed',
    code: 'MANUAL_COMMIT_CONFLICT',
  });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect((await dependencies.journal.read(ATTEMPT_ID))?.postActions?.[0]).toMatchObject({
    state: 'failed',
    runs: 1,
  });

  // Close lists the attempt's files under the attempt (retry the attempt commit), its declared
  // files included, and the owner's apart.
  const hold = await readUncommittedHold(engine, engine.workspace.workspaceId);
  expect(hold?.attempts).toEqual([
    expect.objectContaining({
      attemptId: ATTEMPT_ID,
      step: 'requirements',
      attempt: 1,
      code: 'MANUAL_COMMIT_CONFLICT',
      paths: [notes, 'src/app.ts'],
      count: 2,
    }),
  ]);
  expect(hold?.owners.flatMap((owner) => owner.paths)).toEqual([foreign]);

  // The content is the agent's again: the retry commits the attempt, and only it, once.
  await writeFile(join(root, 'src/app.ts'), 'export const app = 2;\n');
  const [committed] = await retryAgentPostActions(dependencies, ATTEMPT_ID);
  expect(committed).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  expect(git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual(
    ['src/app.ts', notes].sort(),
  );
  expect(git(root, 'rev-parse', 'HEAD~1')).toBe(head);
  const message = git(root, 'log', '-1', '--format=%B');
  expect(message.split('\n')[0]).toMatch(
    /^spec\(specification\): Requirements \(attempt 1\) by agent in /u,
  );
  expect(message).toContain(`Nevo-Attempt: ${ATTEMPT_ID}`);
  expect(message).toContain('Nevo-Step: requirements#1');
  expect(dirty()).toEqual([foreign]);
  expect(await readFile(join(root, foreign), 'utf8')).toBe('# The owner wrote this\n');

  expect(await retryAgentPostActions(dependencies, ATTEMPT_ID)).toEqual([]);
  expect(commitsOf(ATTEMPT_ID)).toHaveLength(1);
}, 600_000);

it('commits a file the attempt saved more than 50 times and a declared rename, once across a crash', async () => {
  const attemptId = '5d4e0a96-ae87-4b99-9c7c-5fbec16dc106';
  const invocation = '6e5f1ba7-bf98-4caa-8d8d-6acfd27ed207';
  const saved = `${directory}/design.md`;
  const other = `${directory}/other.md`;
  for (let save = 1; save <= 52; save += 1) {
    await recorded(saved, `# Design, save ${String(save)}\n`, invocation);
    // Another author's file, truncated too, elsewhere in the ledger: it does not block the commit.
    await recorded(other, `# Other, save ${String(save)}\n`);
  }

  git(root, 'mv', 'src/app.ts', 'src/main.ts');
  const renamed = sha256Hex('export const app = 2;\n');
  const journal = await finishedAttempt(attemptId, invocation, 'design', [
    { path: 'src/app.ts', sha256: null },
    { path: 'src/main.ts', sha256: renamed },
  ]);
  const head = git(root, 'rev-parse', 'HEAD');

  // The process stops once the commit exists and the ledger is pruned, before its run is recorded.
  const [stopped] = await commitAgentAttempt(engine, journal, journal.postActions![0]!, {
    deps: {
      hooks: {
        afterCompleted: () => Promise.reject(new ManualCommitInterrupted('completion')),
      },
    },
  });
  expect(stopped).toMatchObject({ status: 'failed' });
  const sha = git(root, 'rev-parse', 'HEAD');
  expect(git(root, 'rev-parse', 'HEAD~1')).toBe(head);

  // The restart runs the same operation: it reports that commit and makes no second one.
  const [resumed] = await runAgentPostActions(dependencies, attemptId);
  expect(resumed).toMatchObject({ status: 'completed', commit: { sha } });
  expect(commitsOf(attemptId)).toEqual([sha]);
  expect(git(root, 'show', '--name-status', '--format=', 'HEAD').split('\n').sort()).toEqual(
    ['A\t' + saved, 'R100\tsrc/app.ts\tsrc/main.ts'].sort(),
  );
  expect(dirty()).toEqual([`${directory}/owner.md`, other].sort());
}, 600_000);

it('refuses a file the attempt changed together with someone else, naming it', async () => {
  const attemptId = '7f6a2cb8-c0a9-4dbb-9e9e-7bd0e38fe308';
  const invocation = '807b3dc9-d1ba-4ecc-8f0f-8ce1f49a0409';
  const shared = `${directory}/shared.md`;
  await recorded(shared, '# Shared, by the owner\n');
  await recorded(shared, '# Shared, then by the agent\n', invocation);
  await finishedAttempt(attemptId, invocation, 'review', []);
  const head = git(root, 'rev-parse', 'HEAD');

  const [refused] = await runAgentPostActions(dependencies, attemptId);
  expect(refused).toMatchObject({
    status: 'failed',
    code: 'ATTEMPT_COMMIT_MIXED_AUTHORS',
    message: expect.stringContaining(shared) as string,
  });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
}, 600_000);
