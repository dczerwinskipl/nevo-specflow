// Integration (real project, real Git, automatic commits off): the one commit of an agent attempt
// (D15). One checkout for the file: the attempt's ledger entry and declared file, and another
// author's ledger entry beside them.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import { recordLedgerEntries } from '../../src/specs/durable';
import { readUncommittedHold } from '../../src/specs/uncommitted';
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
      paths: [{ path, postSha256: await put(path, content) }],
      ...(executionId !== undefined ? { executionId } : {}),
      branch: git(root, 'branch', '--show-current'),
      head: git(root, 'rev-parse', 'HEAD'),
    },
  );
}

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
  const journal: AgentAttemptJournal = {
    version: 1,
    operationId: ATTEMPT_ID,
    subject: { kind: 'specification', specId },
    step: 'requirements',
    attempt: 1,
    actor: agent,
    workspaceId: engine.workspace.workspaceId,
    turns: [{ invocationId: INVOCATION, turnId: 'turn-1', boundAt: AT, finalizedAt: AT }],
    proposal: {
      requestDigest: 'a'.repeat(64),
      invocationId: INVOCATION,
      actor: agent,
      input: {},
      changes: { paths: ['src/app.ts'] },
      transition: 'agreed',
      submittedAt: AT,
      state: 'finalized',
    },
    postActions: [
      {
        kind: 'attempt-commit',
        operationId: agentPostActionId(ATTEMPT_ID, 'attempt-commit'),
        stepTitle: 'Requirements',
        state: 'pending',
        declared: [{ path: 'src/app.ts', sha256: published }],
      },
    ],
  };
  await withProjectControlLock(engine.context, () => dependencies.journal.publish(journal));
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

  // Close lists the attempt's paths under the attempt (retry the attempt commit), the owner's apart.
  const hold = await readUncommittedHold(engine, engine.workspace.workspaceId);
  expect(hold?.attempts).toEqual([
    expect.objectContaining({
      attemptId: ATTEMPT_ID,
      step: 'requirements',
      attempt: 1,
      code: 'MANUAL_COMMIT_CONFLICT',
      paths: [notes],
      count: 1,
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
  expect(
    git(root, 'log', '--format=%H', `--grep=Nevo-Attempt: ${ATTEMPT_ID}`).split('\n'),
  ).toHaveLength(1);
}, 600_000);
