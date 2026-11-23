// Integration (real project, real Git): what the one commit of an agent attempt (D15) holds across
// the owner's Confirm, a crash during its finalize and automatic document commits. One checkout for
// the file; each case runs a real attempt (start, the Turn's writes under its claim, proposal,
// finalize) on a Specification of its own, in this order, each leaving the checkout clean but the last.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import {
  admitWorkspaceExecution,
  applyDocumentChange,
  bootstrapProjectHome,
  confirmAgentResult,
  createSpecificationForTesting,
  createTask,
  finalizeAgentAttempt,
  finishStep,
  inspectActions,
  installProjectDefinitions,
  markWorkspaceExecutionDispatched,
  openAgentAttempts,
  openWorkflow,
  proposeAgentFinish,
  rejectAgentResult,
  retryAgentAttemptCommit,
  startAgentAttempt,
  startSpecificationExecution,
  takeOverAgentAttempt,
  type AgentActor,
  type AgentAttemptDependencies,
  type FinalizeBoundary,
  type FinishStepInput,
  type SpecFlowEngine,
  type WorkspaceExecutionIntent,
} from '../../src/testing';
import { commitExecutionState } from '../../src/specs/documents/execution-state-commit';
import { readLedgerRecord } from '../../src/specs/durable';
import { ledgerAuthorsOf } from '../../src/specs/durable/ledger/model';
import { commitStaged, createGitTestProject, git } from '../support/git-project';
import { enableAutoCommitForTesting } from '../support/document-writes';

const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;

let root: string;
let engine: SpecFlowEngine;

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

const dirty = () =>
  git(root, 'status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    // `git` trims its output: the first line may have lost the blank of its status.
    .map((line) => line.trimStart().replace(/^\S+\s+/u, ''))
    .sort();

const filesOf = (sha: string) =>
  git(root, 'show', '--name-only', '--format=', sha).split('\n').filter(Boolean).sort();

const attemptCommits = (attemptId: string) =>
  git(root, 'log', '--format=%H', `--grep=Nevo-Attempt: ${attemptId}`).split('\n').filter(Boolean);

const commitsSince = (head: string) =>
  git(root, 'rev-list', `${head}..HEAD`).split('\n').filter(Boolean);

async function newSpecification(title: string) {
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title,
    created: '2026-11-23',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });

  return {
    specId: spec.specId,
    directory: 'specs/active/' + spec.slug,
    subject: { kind: 'specification', specId: spec.specId } as const,
  };
}

type Spec = Awaited<ReturnType<typeof newSpecification>>;

/** The owner starts and finishes the Specification's next step. */
async function ownerStep(spec: Spec, input: FinishStepInput['input'] = {}) {
  const workflow = await openWorkflow(engine);
  const started = await startSpecificationExecution(workflow, {
    specId: spec.specId,
    archetype: 'feature',
    actor: owner,
  });
  if (started.kind === 'terminal') {
    throw new Error('Nothing to start.');
  }

  return finishStep(workflow, {
    subject: spec.subject,
    step: started.context.step.id,
    attempt: started.context.attempt,
    input,
    actor: owner,
  });
}

interface AgentTurnOptions {
  readonly step: string;
  readonly archetype: string;
  /** The Turn's own writes, under its claim (the broker's identity). */
  readonly work: (owned: {
    readonly ownedExecution: { readonly operationId: string };
  }) => Promise<void>;
  readonly input?: FinishStepInput['input'];
  readonly declared?: readonly string[];
  readonly faults?: (boundary: FinalizeBoundary) => void | Promise<void>;
  /** The Turn ends without a proposal (`false`); it proposes by default. */
  readonly propose?: false;
}

/** One agent attempt of one Turn on the Specification's ready step, up to its finalize. */
async function agentAttempt(spec: Spec, options: AgentTurnOptions) {
  const agent = await openAgentAttempts(engine);
  const actor: AgentActor = {
    class: 'agent',
    details: { archetype: options.archetype, provider: 'claude', sessionId: 'session-a' },
  };
  const invocationId = randomUUID();
  const { binding } = await startAgentAttempt(agent, {
    subject: spec.subject,
    archetype: 'feature',
    actor,
    expected: { step: options.step },
    workspaceId: engine.workspace.workspaceId,
    turn: { invocationId, turnId: 'turn-1' },
  });
  const intent: WorkspaceExecutionIntent = {
    operationId: invocationId,
    ownerId: 'session-a',
    binding: 'a'.repeat(64),
    attempt: { attemptId: binding.attemptId },
  };
  await admitWorkspaceExecution(engine, intent);
  await markWorkspaceExecutionDispatched(engine, intent);
  await options.work({ ownedExecution: { operationId: invocationId } });
  if (options.propose !== false) {
    await proposeAgentFinish(agent, {
      turn: {
        attemptId: binding.attemptId,
        invocationId,
        actor,
        subject: spec.subject,
        step: options.step,
        attempt: 1,
      },
      input: options.input ?? {},
      ...(options.declared ? { changes: { paths: [...options.declared] } } : {}),
    });
  }

  const receipt = { invocationId, process: 'stopped' as const, outcome: 'completed' as const };
  const finalize = (dependencies: AgentAttemptDependencies) =>
    finalizeAgentAttempt(dependencies, { attemptId: binding.attemptId, intent, receipt });
  const faulty: AgentAttemptDependencies = options.faults
    ? { ...agent, finalize: { ...agent.finalize, faults: options.faults } }
    : agent;

  return { agent, attemptId: binding.attemptId, finalize, faulty };
}

/** The Turn's save of a document of the Specification through the document writer. */
async function saveDocument(
  spec: Spec,
  documentId: string,
  path: string,
  content: string,
  owned: { readonly ownedExecution: { readonly operationId: string } },
) {
  const current = await readFile(join(root, path), 'utf8');
  await applyDocumentChange(
    engine,
    spec.specId,
    randomUUID(),
    { action: 'save', documentId, content, expectedRevision: sha256Hex(current) },
    owned,
  );
}

/** The owner's steps up to the breakdown review, the breakdown drafting two Tasks. */
async function toBreakdownReview(spec: Spec): Promise<void> {
  for (let step = 0; step < 3; step += 1) {
    await ownerStep(spec);
  }

  await ownerStep(spec, {
    tasks: [
      { id: 'api', title: 'API', type: 'implementation' },
      { id: 'screen', title: 'Screen', type: 'ui-implementation', dependsOn: ['api'] },
    ],
  });
}

beforeAll(async () => {
  root = await createGitTestProject(
    'specflow-attempt-boundaries-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  git(root, 'checkout', '-q', '-b', 'feature/work');
  engine = await bootstrapProjectHome(root);
  await installProjectDefinitions(engine);
  await put('src/app.ts', 'export const app = 1;\n');
  git(root, 'add', '-A');
  commitStaged(root, 'fixture');
}, 600_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
});

it('refuses Confirm until the attempt commit ran; then one attempt commit holds the agent’s work and the owner’s holds none of it', async () => {
  const spec = await newSpecification('Confirm after commit');
  await toBreakdownReview(spec);
  expect(dirty()).toEqual([]);
  const head = git(root, 'rev-parse', 'HEAD');
  const overview = `${spec.directory}/overview.md`;

  // The reviewer passes the breakdown: `approve-draft-tasks` is the owner's, so the result waits. An
  // outside edit of the agent's file before its attempt commit runs makes that commit fail.
  const attempt = await agentAttempt(spec, {
    step: 'breakdown-review',
    archetype: 'reviewer',
    input: { result: 'pass', feedback: 'Ready.' },
    declared: ['src/app.ts'],
    work: async (owned) => {
      await saveDocument(spec, 'overview', overview, '# Reviewed by the agent\n', owned);
      await put('src/app.ts', 'export const app = 2;\n');
    },
    faults: async (boundary) => {
      if (boundary === 'post-actions-pending') {
        await put('src/app.ts', 'export const app = 3;\n');
      }
    },
  });
  expect(await attempt.finalize(attempt.faulty)).toMatchObject({
    kind: 'awaiting-confirmation',
    postActions: [{ action: 'attempt-commit', status: 'failed', code: 'MANUAL_COMMIT_CONFLICT' }],
  });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);

  const workflow = await openWorkflow(engine);
  const shown = async () => {
    const projection = await inspectActions(workflow, spec.subject);
    if (projection.position.kind !== 'awaiting-confirmation') {
      throw new Error(`Nothing awaits the owner (${projection.position.kind}).`);
    }

    return {
      confirm: projection.actions.confirm,
      reject: projection.actions.reject,
      digest: projection.position.confirmsDigest,
    };
  };

  expect((await shown()).confirm).toEqual({
    step: 'breakdown-review',
    attempt: 1,
    unavailable: { reason: 'attempt-commit-failed', code: 'MANUAL_COMMIT_CONFLICT' },
  });
  const confirm = {
    subject: spec.subject,
    step: 'breakdown-review',
    attempt: 1,
    actor: owner,
    requestId: randomUUID(),
    confirmsDigest: (await shown()).digest,
  };
  await expect(confirmAgentResult(attempt.agent, confirm)).rejects.toMatchObject({
    code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED',
  });
  // Reject waits for the attempt commit too: its run write would join the agent's uncommitted entry.
  expect((await shown()).reject).toEqual({
    step: 'breakdown-review',
    attempt: 1,
    unavailable: { reason: 'attempt-commit-failed', code: 'MANUAL_COMMIT_CONFLICT' },
  });
  const { confirmsDigest: _digest, ...decision } = confirm;
  await expect(
    rejectAgentResult(attempt.agent, {
      ...decision,
      requestId: randomUUID(),
      feedback: 'Split the API Task.',
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  // Nothing was committed or applied for the refused Confirm and Reject.
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect((await shown()).confirm?.unavailable?.reason).toBe('attempt-commit-failed');

  // The agent's content again: Retry commit makes the attempt commit, then Confirm applies.
  await put('src/app.ts', 'export const app = 2;\n');
  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'breakdown-review',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  expect((await shown()).confirm).toEqual({ step: 'breakdown-review', attempt: 1 });
  const confirmed = await confirmAgentResult(attempt.agent, confirm);
  expect(confirmed).toMatchObject({
    transition: 'approved',
    postActions: [{ action: 'commit-execution-state', status: 'completed' }],
  });

  const [attemptCommit, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  expect(commitsSince(head)).toEqual([git(root, 'rev-parse', 'HEAD'), attemptCommit]);
  const agentFiles = filesOf(attemptCommit!);
  expect(agentFiles).toEqual(expect.arrayContaining(['src/app.ts', overview]));
  expect(agentFiles.some((path) => path.startsWith(`${spec.directory}/.execution/`))).toBe(true);
  // The owner's commit takes only what Confirm wrote: the run and the approved Tasks, never a file
  // of the agent's attempt that Confirm did not write again.
  const ownerFiles = filesOf('HEAD');
  expect(ownerFiles).not.toContain('src/app.ts');
  expect(ownerFiles).not.toContain(overview);
  expect(ownerFiles.every((path) => path.startsWith(`${spec.directory}/`))).toBe(true);
  expect(dirty()).toEqual([]);
}, 600_000);

it('commits the execution state an attempt left without its own commit (taken over) with the owner’s next commit', async () => {
  const spec = await newSpecification('Taken over');
  const head = git(root, 'rev-parse', 'HEAD');
  const overview = `${spec.directory}/overview.md`;

  // The agent's Turn writes a document and ends without a proposal; the owner takes the step over.
  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    propose: false,
    work: (owned) => saveDocument(spec, 'overview', overview, '# Started by the agent\n', owned),
  });
  expect(await attempt.finalize(attempt.agent)).toEqual({ kind: 'turn-ended' });
  const taken = await takeOverAgentAttempt(attempt.agent, {
    subject: spec.subject,
    step: 'requirements',
    attempt: 1,
    actor: owner,
  });
  expect(taken.context.attempt).toBe(2);

  // No attempt commit runs for a taken-over attempt: the owner's commit takes its execution state.
  const workflow = await openWorkflow(engine);
  const finished = await finishStep(workflow, {
    subject: spec.subject,
    step: 'requirements',
    attempt: 2,
    input: {},
    actor: owner,
  });
  expect(finished.postActions).toEqual([
    {
      action: 'commit-execution-state',
      status: 'completed',
      commit: expect.objectContaining({ sha: expect.any(String) as string }) as object,
    },
  ]);
  await ownerStep(spec);
  expect(attemptCommits(attempt.attemptId)).toEqual([]);
  expect(commitsSince(head)).toHaveLength(2);
  // Only the agent's document stays for the owner to commit (documents are committed by hand).
  expect(dirty()).toEqual([overview]);

  git(root, 'add', '-A');
  commitStaged(root, 'the agent’s overview');
}, 600_000);

it('never judges a proposal again once its judgement is recorded: a later edit is not the agent’s', async () => {
  const spec = await newSpecification('Crash after the judgement');
  const head = git(root, 'rev-parse', 'HEAD');
  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    declared: ['src/app.ts'],
    work: () => put('src/app.ts', 'export const app = 6;\n'),
    faults: (boundary) => {
      if (boundary === 'judged-recorded') {
        throw new Error('Crash at judged-recorded.');
      }
    },
  });
  await expect(attempt.finalize(attempt.faulty)).rejects.toThrow('Crash at judged-recorded.');

  // Someone edits the declared file before the finalize runs again, the step not published yet.
  await put('src/app.ts', 'export const app = "foreign";\n');
  expect(await attempt.finalize(attempt.agent)).toMatchObject({
    kind: 'finished',
    postActions: [
      {
        action: 'attempt-commit',
        status: 'failed',
        code: 'MANUAL_COMMIT_CONFLICT',
        message: expect.stringContaining('src/app.ts') as string,
      },
    ],
  });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);

  // The agent's content again: Retry commit takes it, as the agent wrote it.
  await put('src/app.ts', 'export const app = 6;\n');
  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  expect(git(root, 'show', 'HEAD:src/app.ts')).toBe('export const app = 6;');
  expect(dirty()).toEqual([]);
}, 600_000);

it('retries an attempt commit a crash left pending without a restart, and Reject waits for it', async () => {
  const spec = await newSpecification('Pending commit');
  await toBreakdownReview(spec);
  expect(dirty()).toEqual([]);
  const head = git(root, 'rev-parse', 'HEAD');
  const attempt = await agentAttempt(spec, {
    step: 'breakdown-review',
    archetype: 'reviewer',
    input: { result: 'pass', feedback: 'Ready.' },
    declared: ['src/app.ts'],
    work: () => put('src/app.ts', 'export const app = 7;\n'),
    faults: (boundary) => {
      if (boundary === 'post-actions-pending') {
        throw new Error('Crash at post-actions-pending.');
      }
    },
  });
  await expect(attempt.finalize(attempt.faulty)).rejects.toThrow('Crash at post-actions-pending.');

  const workflow = await openWorkflow(engine);
  const projection = async () => {
    const shown = await inspectActions(workflow, spec.subject);
    if (shown.position.kind !== 'awaiting-confirmation') {
      throw new Error(`Nothing awaits the owner (${shown.position.kind}).`);
    }

    return { actions: shown.actions, digest: shown.position.confirmsDigest };
  };

  const pending = { reason: 'attempt-commit-pending' };
  const ref = { step: 'breakdown-review', attempt: 1 };
  expect((await projection()).actions).toMatchObject({
    confirm: { ...ref, unavailable: pending },
    reject: { ...ref, unavailable: pending },
  });
  const decision = { subject: spec.subject, ...ref, actor: owner };
  await expect(
    rejectAgentResult(attempt.agent, {
      ...decision,
      requestId: randomUUID(),
      feedback: 'Not yet.',
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);

  // Retry commit runs the pending attempt commit now, without a restart; Confirm then applies.
  const [retried] = (await retryAgentAttemptCommit(attempt.agent, decision)).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  expect(attemptCommits(attempt.attemptId)).toHaveLength(1);
  const after = await projection();
  expect(after.actions.confirm).toEqual(ref);
  expect(after.actions.reject).toEqual(ref);
  expect(
    await confirmAgentResult(attempt.agent, {
      ...decision,
      requestId: randomUUID(),
      confirmsDigest: after.digest,
    }),
  ).toMatchObject({ transition: 'approved' });
  expect(dirty()).toEqual([]);
}, 600_000);

it('with automatic commits on, commits an attempt’s documents and code as its one attempt commit', async () => {
  await enableAutoCommitForTesting(root);
  const spec = await newSpecification('Auto commits');
  expect(dirty()).toEqual([]);
  const head = git(root, 'rev-parse', 'HEAD');
  const overview = `${spec.directory}/overview.md`;

  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    declared: ['src/app.ts'],
    work: async (owned) => {
      await saveDocument(spec, 'overview', overview, '# Requirements by the agent\n', owned);
      await put('src/app.ts', 'export const app = 4;\n');
    },
  });
  expect(await attempt.finalize(attempt.agent)).toMatchObject({
    kind: 'finished',
    postActions: [
      {
        action: 'attempt-commit',
        status: 'completed',
        commit: { sha: expect.any(String) as string },
      },
    ],
  });

  const [sha, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  // Nothing of the attempt went through the queue as a commit of its own.
  expect(commitsSince(head)).toEqual([sha]);
  const files = filesOf(sha!);
  expect(files).toEqual(expect.arrayContaining(['src/app.ts', overview]));
  expect(files.some((path) => path.startsWith(`${spec.directory}/.execution/`))).toBe(true);
  expect(dirty()).toEqual([]);
}, 600_000);

it('with automatic commits on, commits a documents-only attempt as its one attempt commit', async () => {
  const spec = await newSpecification('Documents only');
  const head = git(root, 'rev-parse', 'HEAD');
  const overview = `${spec.directory}/overview.md`;

  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    work: (owned) => saveDocument(spec, 'overview', overview, '# Only documents\n', owned),
  });
  expect(await attempt.finalize(attempt.agent)).toMatchObject({
    kind: 'finished',
    postActions: [
      {
        action: 'attempt-commit',
        status: 'completed',
        commit: { sha: expect.any(String) as string },
      },
    ],
  });

  const [sha] = attemptCommits(attempt.attemptId);
  expect(commitsSince(head)).toEqual([sha]);
  expect(filesOf(sha!)).toContain(overview);
  expect(dirty()).toEqual([]);
}, 600_000);

it('never commits an edit made after a crash at the step publication as the agent’s', async () => {
  await rm(join(root, '.nevo', 'local', 'config.yaml'), { force: true });
  const spec = await newSpecification('Crash then edit');
  const head = git(root, 'rev-parse', 'HEAD');
  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    declared: ['src/app.ts'],
    work: () => put('src/app.ts', 'export const app = 5;\n'),
    faults: (boundary) => {
      if (boundary === 'step-published') {
        throw new Error('Crash at step-published.');
      }
    },
  });
  await expect(attempt.finalize(attempt.faulty)).rejects.toThrow('Crash at step-published.');

  // Someone edits the declared file before the finalize runs again: its replay does not take it.
  await put('src/app.ts', 'export const app = "foreign";\n');
  const result = await attempt.finalize(attempt.agent);
  expect(result).toMatchObject({
    kind: 'finished',
    postActions: [
      {
        action: 'attempt-commit',
        status: 'failed',
        code: 'MANUAL_COMMIT_CONFLICT',
        message: expect.stringContaining('src/app.ts') as string,
      },
    ],
  });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect(attemptCommits(attempt.attemptId)).toEqual([]);
  expect(git(root, 'show', 'HEAD:src/app.ts')).not.toContain('foreign');

  // The owner's commit of the workflow state never takes what the agent's Turns wrote: that waits
  // for the attempt commit (Retry commit), only the owner's own Task is committed.
  await createTask(await openWorkflow(engine), {
    specId: spec.specId,
    taskId: 'later',
    title: 'Later',
    type: 'implementation',
    actor: owner,
  });
  const record = await readLedgerRecord(engine.context, engine.workspace.workspaceId, {
    kind: 'specification',
    id: spec.specId,
  });
  const agents = (record?.entries ?? [])
    .filter((entry) => ledgerAuthorsOf(entry).executions.length > 0)
    .map((entry) => entry.path);
  expect(agents.some((path) => path.startsWith(`${spec.directory}/.execution/`))).toBe(true);
  const outcome = await commitExecutionState(engine, spec.specId, { phrase: 'add a Task' });
  expect(outcome).toMatchObject({ kind: 'committed' });
  const committed = filesOf('HEAD');
  expect(committed).toContain(`${spec.directory}/tasks/later/task.yaml`);
  expect(committed.filter((path) => agents.includes(path))).toEqual([]);
  expect(dirty()).toEqual(expect.arrayContaining(agents));
}, 600_000);
