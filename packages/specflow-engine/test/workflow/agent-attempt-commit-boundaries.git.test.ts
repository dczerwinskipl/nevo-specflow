// Integration (real project, real Git): what the one commit of an agent attempt (D15) holds across
// the owner's Confirm, a crash during its finalize, automatic document commits, and Close and Abandon
// while it waits. Each case runs on a checkout of its own, a copy of one initialised template, with
// its commit policy set explicitly; each runs a real attempt (start, the Turn's writes under its
// claim, proposal, finalize) on a Specification of its own.
import { randomUUID } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import {
  abandonSpecification,
  admitWorkspaceExecution,
  applyDocumentChange,
  bootstrapProjectHome,
  closeSpecification,
  closeWorktree,
  confirmAgentResult,
  createSpecificationForTesting,
  createTask,
  finalizeAgentAttempt,
  finishStep,
  inspectActions,
  installProjectDefinitions,
  manualCommit,
  openSpecFlowEngine,
  markWorkspaceExecutionDispatched,
  openAgentAttempts,
  openWorkflow,
  proposeAgentFinish,
  readSpecificationDocumentTree,
  readWorkspaceSpecification,
  rejectAgentResult,
  retryAgentAttemptCommit,
  returnDuringAgentAttempt,
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
import { previewPublicCloseOperation } from '../../src/specs/operations/api';
import { ledgerAuthorsOf } from '../../src/specs/durable/ledger/model';
import { commitStaged, createGitTestProject, git } from '../support/git-project';
import { setLocalAutoCommit } from '../support/document-writes';

const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;

/**
 * The designated project every case copies: Git on, definitions installed, `src/app.ts` and a
 * committed Specification that never started (`siblingSpecId`, which a Close may archive).
 */
let template: string;
let siblingSpecId: string;
/** The case's own checkout (the project's primary one, or the case's linked worktree). */
let root: string;
let engine: SpecFlowEngine;
/** Directories the case created, removed after it. */
const cleanup: string[] = [];

/** Automatic document commits of the case's project, set explicitly (workstation-local config). */
const autoCommitDocuments = (documents: boolean) => setLocalAutoCommit({ root }, documents);

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

const subjectOf = (sha: string) => git(root, 'log', '-1', '--format=%s', sha);

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
  /** The attempt the Turn works on (the step's first by default). */
  readonly attempt?: number;
  /** The checkout the Turn runs in (the Engine's own by default). */
  readonly workspaceId?: string;
}

/** One agent attempt of one Turn on the Specification's ready step, up to its finalize. */
async function agentAttempt(spec: Spec, options: AgentTurnOptions) {
  const agent = await openAgentAttempts(engine);
  const actor: AgentActor = {
    class: 'agent',
    details: { archetype: options.archetype, provider: 'claude', sessionId: 'session-a' },
  };
  const invocationId = randomUUID();
  const workspaceId = options.workspaceId ?? engine.workspace.workspaceId;
  const { binding } = await startAgentAttempt(agent, {
    subject: spec.subject,
    archetype: 'feature',
    actor,
    expected: { step: options.step },
    workspaceId,
    turn: { invocationId, turnId: 'turn-1' },
  });
  const intent: WorkspaceExecutionIntent = {
    operationId: invocationId,
    ownerId: 'session-a',
    binding: 'a'.repeat(64),
    attempt: { attemptId: binding.attemptId },
  };
  const target = { workspaceId, specId: spec.specId };
  await admitWorkspaceExecution(engine, intent, target);
  await markWorkspaceExecutionDispatched(engine, intent, target);
  await options.work({ ownedExecution: { operationId: invocationId } });
  if (options.propose !== false) {
    await proposeAgentFinish(agent, {
      turn: {
        attemptId: binding.attemptId,
        invocationId,
        actor,
        subject: spec.subject,
        step: options.step,
        attempt: options.attempt ?? 1,
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
  template = await createGitTestProject(
    'specflow-attempt-boundaries-',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  git(template, 'checkout', '-q', '-b', 'feature/work');
  const designated = await bootstrapProjectHome(template);
  await installProjectDefinitions(designated);
  await mkdir(join(template, 'src'), { recursive: true });
  await writeFile(join(template, 'src', 'app.ts'), 'export const app = 1;\n');
  siblingSpecId = (
    await createSpecificationForTesting(designated, {
      operationId: randomUUID(),
      title: 'Sibling',
      created: '2026-11-23',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: designated.workspace.workspaceId },
    })
  ).specId;
  git(template, 'add', '-A');
  commitStaged(template, 'fixture');
}, 600_000);

/**
 * The template's Project Home moved to `root`: its local state names the template's checkout by
 * path (the marker's home root and Git directory, the registry's roots), so those paths are
 * rewritten; the identities (project, Git instance, workspaces) stay, one copy per case.
 */
async function moveProjectHome(): Promise<void> {
  const spellings = (path: string) => [
    JSON.stringify(path).slice(1, -1),
    path.replaceAll('\\', '/'),
  ];
  const [from, to] = [spellings(template), spellings(root)];
  const local = join(root, '.nevo', 'local');
  for (const entry of await readdir(local, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const path = join(entry.parentPath, entry.name);
    let text = await readFile(path, 'utf8');
    from.forEach((spelling, index) => (text = text.replaceAll(spelling, to[index]!)));
    if (text.includes(basename(template))) {
      throw new Error(`The template's path is left in ${path}.`);
    }

    await writeFile(path, text);
  }
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'specflow-attempt-case-')));
  cleanup.push(root);
  await cp(template, root, { recursive: true });
  await moveProjectHome();
  engine = await openSpecFlowEngine({ cwd: root });
}, 600_000);

afterEach(async () => {
  for (const directory of cleanup.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

afterAll(async () => {
  await rm(template, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
});

it('refuses Confirm until the attempt commit ran; then one attempt commit holds the agent’s work and the owner’s holds none of it', async () => {
  await autoCommitDocuments(false);
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
  await autoCommitDocuments(false);
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
}, 600_000);

it('never judges a proposal again once its judgement is recorded: a later edit is not the agent’s', async () => {
  await autoCommitDocuments(false);
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
  await autoCommitDocuments(false);
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

/**
 * The agent finished the requirements step without a confirmation and its attempt commit waits
 * (`fault` makes it fail or leaves it pending): no owner or agent write of the Specification is
 * admitted until Retry commit ran it, then the owner goes on and the history is one attempt commit
 * and the owner's commit, with nothing left uncommitted.
 */
async function refusedUntilRetried(
  title: string,
  fault: 'failed' | 'pending',
  value: number,
): Promise<void> {
  const spec = await newSpecification(title);
  const head = git(root, 'rev-parse', 'HEAD');
  const agentContent = `export const app = ${String(value)};\n`;
  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    declared: ['src/app.ts'],
    work: () => put('src/app.ts', agentContent),
    faults: async (boundary) => {
      if (boundary !== 'post-actions-pending') {
        return;
      }

      if (fault === 'pending') {
        throw new Error('Crash at post-actions-pending.');
      }

      await put('src/app.ts', 'export const app = "outside";\n');
    },
  });
  if (fault === 'pending') {
    await expect(attempt.finalize(attempt.faulty)).rejects.toThrow(
      'Crash at post-actions-pending.',
    );
  } else {
    expect(await attempt.finalize(attempt.faulty)).toMatchObject({
      kind: 'finished',
      postActions: [{ action: 'attempt-commit', status: 'failed', code: 'MANUAL_COMMIT_CONFLICT' }],
    });
  }

  const reason = fault === 'pending' ? 'attempt-commit-pending' : 'attempt-commit-failed';
  const workflow = await openWorkflow(engine);
  const projection = await inspectActions(workflow, spec.subject);
  expect(projection.attemptCommit).toMatchObject({
    attemptId: attempt.attemptId,
    reason,
    subject: { specId: spec.specId },
    step: 'requirements',
    attempt: 1,
  });
  expect(projection.actions.start?.unavailable).toMatchObject({ reason });
  expect(projection.position).toMatchObject({
    kind: 'ready',
    next: { agent: { kind: 'unavailable', reason } },
  });

  // The owner's start of the next step, Abandon and a new agent attempt are refused before
  // anything is written.
  const run = join(root, spec.directory, '.execution', 'specification.yaml');
  const before = { dirty: dirty(), run: await readFile(run, 'utf8') };
  await expect(ownerStep(spec)).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  await expect(
    abandonSpecification(await openWorkflow(engine), {
      specId: spec.specId,
      reason: 'Not needed any more.',
      actor: owner,
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  await expect(
    startAgentAttempt(attempt.agent, {
      subject: spec.subject,
      archetype: 'feature',
      actor: {
        class: 'agent',
        details: { archetype: 'spec-writer', provider: 'claude', sessionId: 'session-b' },
      },
      expected: { step: 'specification' },
      workspaceId: engine.workspace.workspaceId,
      turn: { invocationId: randomUUID(), turnId: 'turn-1' },
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  expect({ dirty: dirty(), run: await readFile(run, 'utf8') }).toEqual(before);
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);

  // The agent's content again: Retry commit makes the attempt commit, then the owner goes on.
  await put('src/app.ts', agentContent);
  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  expect((await inspectActions(workflow, spec.subject)).attemptCommit).toBeUndefined();
  const finished = await ownerStep(spec);
  expect(finished.postActions).toMatchObject([
    {
      action: 'commit-execution-state',
      status: 'completed',
      commit: { sha: expect.any(String) as string },
    },
  ]);

  const [attemptCommit, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  expect(commitsSince(head)).toEqual([git(root, 'rev-parse', 'HEAD'), attemptCommit]);
  expect(dirty()).toEqual([]);
}

it('refuses every workflow write of the Specification while a finished attempt’s commit failed, until Retry commit', async () => {
  await autoCommitDocuments(false);
  await refusedUntilRetried('Owner waits for a failed commit', 'failed', 8);
}, 600_000);

it('refuses every workflow write of the Specification while a crash left the attempt commit pending, until Retry commit', async () => {
  await autoCommitDocuments(false);
  await refusedUntilRetried('Owner waits for a pending commit', 'pending', 9);
}, 600_000);

it('commits the owner’s Reject, so the next attempt commits on its own', async () => {
  await autoCommitDocuments(false);
  const spec = await newSpecification('Reject then again');
  await toBreakdownReview(spec);
  const review = (archetypeSession: string) =>
    agentAttempt(spec, {
      step: 'breakdown-review',
      archetype: 'reviewer',
      input: { result: 'pass', feedback: `Ready (${archetypeSession}).` },
      work: () => Promise.resolve(),
      ...(archetypeSession === 'second' ? { attempt: 2 } : {}),
    });
  const first = await review('first');
  expect(await first.finalize(first.agent)).toMatchObject({
    kind: 'awaiting-confirmation',
    postActions: [{ action: 'attempt-commit', status: 'completed' }],
  });
  const head = git(root, 'rev-parse', 'HEAD');

  const rejected = await rejectAgentResult(first.agent, {
    subject: spec.subject,
    step: 'breakdown-review',
    attempt: 1,
    actor: owner,
    requestId: randomUUID(),
    feedback: 'Split the API Task.',
  });
  expect(rejected.postActions).toMatchObject([
    {
      action: 'commit-execution-state',
      status: 'completed',
      commit: { sha: expect.any(String) as string },
    },
  ]);
  const [rejectCommit] = commitsSince(head);
  expect(subjectOf(rejectCommit!)).toContain('reject the result');
  expect(dirty()).toEqual([]);

  // The next attempt starts from a clean checkout: its commit holds only its own work.
  const second = await review('second');
  expect(await second.finalize(second.agent)).toMatchObject({
    kind: 'awaiting-confirmation',
    postActions: [{ action: 'attempt-commit', status: 'completed' }],
  });
  expect(commitsSince(head)).toEqual([...attemptCommits(second.attemptId), rejectCommit]);
  expect(dirty()).toEqual([]);
}, 600_000);

it('commits the owner’s Return during an attempt, so the next attempt commits on its own', async () => {
  await autoCommitDocuments(false);
  const spec = await newSpecification('Return then again');
  const head = git(root, 'rev-parse', 'HEAD');
  const first = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    propose: false,
    work: () => Promise.resolve(),
  });
  expect(await first.finalize(first.agent)).toEqual({ kind: 'turn-ended' });

  const returned = await returnDuringAgentAttempt(first.agent, {
    subject: spec.subject,
    step: 'requirements',
    feedback: 'Start again.',
    actor: owner,
  });
  expect(returned).toMatchObject({
    kind: 'returned',
    postActions: [
      {
        action: 'commit-execution-state',
        status: 'completed',
        commit: { sha: expect.any(String) as string },
      },
    ],
  });
  const [returnCommit, ...beforeReturn] = commitsSince(head);
  expect(beforeReturn).toEqual([]);
  expect(dirty()).toEqual([]);

  const second = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    declared: ['src/app.ts'],
    work: () => put('src/app.ts', 'export const app = 10;\n'),
    attempt: 2,
  });
  expect(await second.finalize(second.agent)).toMatchObject({
    kind: 'finished',
    postActions: [{ action: 'attempt-commit', status: 'completed' }],
  });
  expect(commitsSince(head)).toEqual([...attemptCommits(second.attemptId), returnCommit]);
  expect(dirty()).toEqual([]);
}, 600_000);

it('refuses every workflow write while an attempt journal cannot be read, then the owner’s commit takes the state', async () => {
  await autoCommitDocuments(false);
  const spec = await newSpecification('Unreadable journal');
  const head = git(root, 'rev-parse', 'HEAD');
  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    propose: false,
    work: () => Promise.resolve(),
  });
  expect(await attempt.finalize(attempt.agent)).toEqual({ kind: 'turn-ended' });
  await takeOverAgentAttempt(attempt.agent, {
    subject: spec.subject,
    step: 'requirements',
    attempt: 1,
    actor: owner,
  });

  // Another attempt's journal cannot be read: it may be one whose commit waits, so the wait fails
  // closed and the owner's finish is refused before anything is written.
  const journals = join(engine.context.project.stateRoot, 'engine', 'operations', 'agent-attempt');
  const corrupt = join(journals, `${randomUUID()}.json`);
  await writeFile(corrupt, '{ not json');
  const workflow = await openWorkflow(engine);
  const finish = () =>
    finishStep(workflow, {
      subject: spec.subject,
      step: 'requirements',
      attempt: 2,
      input: {},
      actor: owner,
    });
  const run = join(root, spec.directory, '.execution', 'specification.yaml');
  const before = { dirty: dirty(), run: await readFile(run, 'utf8') };
  await expect(finish()).rejects.toMatchObject({ code: 'WORKFLOW_STATE_CORRUPT' });
  expect({ dirty: dirty(), run: await readFile(run, 'utf8') }).toEqual(before);
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);

  // Once it is repaired, the finish applies and the owner's commit takes the state.
  await rm(corrupt);
  expect((await finish()).postActions).toMatchObject([
    {
      action: 'commit-execution-state',
      status: 'completed',
      commit: { sha: expect.any(String) as string },
    },
  ]);
  expect(dirty()).toEqual([]);
}, 600_000);

/** The tree's document at `path` (Specification-relative). */
async function treeDocument(spec: Spec, path: string) {
  const tree = await readSpecificationDocumentTree(engine, spec.specId);
  const document = tree.documents.find((entry) => entry.path === path);
  if (!document) {
    throw new Error(`No document at ${path}.`);
  }

  return { tree, document };
}

/** The owner's save of the document at `path` (no execution: the owner's write). */
async function ownerSave(spec: Spec, path: string, content: string) {
  const { document } = await treeDocument(spec, path);

  return applyDocumentChange(engine, spec.specId, randomUUID(), {
    action: 'save',
    documentId: document.id,
    content,
    expectedRevision: document.revision,
  });
}

/**
 * An agent attempt of the requirements step whose commit failed (an outside edit of its declared
 * file before the commit ran): it saved the overview, created `notes.md` and changed `src/app.ts`.
 */
async function failedAttemptWithDocuments(
  spec: Spec,
  agentContent: string,
  options: { readonly workspaceId?: string } = {},
) {
  const overview = `${spec.directory}/overview.md`;
  const attempt = await agentAttempt(spec, {
    step: 'requirements',
    archetype: 'spec-writer',
    declared: ['src/app.ts'],
    ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
    work: async (owned) => {
      await saveDocument(spec, 'overview', overview, '# Requirements by the agent\n', owned);
      await applyDocumentChange(
        engine,
        spec.specId,
        randomUUID(),
        {
          action: 'create',
          documents: [{ path: 'notes.md', content: 'Notes by the agent.\n' }],
          folders: [],
        },
        owned,
      );
      await put('src/app.ts', agentContent);
    },
    faults: async (boundary) => {
      if (boundary === 'post-actions-pending') {
        await put('src/app.ts', 'export const app = "outside";\n');
      }
    },
  });
  expect(await attempt.finalize(attempt.faulty)).toMatchObject({
    kind: 'finished',
    postActions: [{ action: 'attempt-commit', status: 'failed', code: 'MANUAL_COMMIT_CONFLICT' }],
  });

  return attempt;
}

/** Pins Close's integration target to the case's branch (`feature/work`), committed. */
async function pinIntegrationTarget(): Promise<void> {
  await writeFile(
    join(root, '.nevo', 'config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: feature/work\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'pin the integration target');
}

/** What a refused Close or Abandon must leave as it was: HEAD, the checkout and the agent's files. */
async function untouched(spec: Spec, others: readonly string[] = []) {
  const files = ['src/app.ts', `${spec.directory}/overview.md`, `${spec.directory}/notes.md`];

  return {
    head: git(root, 'rev-parse', 'HEAD'),
    dirty: dirty(),
    files: await Promise.all(files.map((path) => readFile(join(root, path), 'utf8'))),
    locations: await Promise.all(
      [spec.specId, ...others].map(
        async (specId) => (await readWorkspaceSpecification(root, specId)).location,
      ),
    ),
  };
}

/** The refusal of a Close while the attempt commit failed: the attempt named with its paths. */
function waitingCloseRefusal(attemptId: string) {
  return {
    code: 'DOCUMENT_COMMITS_PENDING',
    details: { uncommitted: { attempts: [expect.objectContaining({ attemptId }) as object] } },
  };
}

const agentPaths = (spec: Spec) => [
  'src/app.ts',
  `${spec.directory}/overview.md`,
  `${spec.directory}/notes.md`,
];

/** The owner's Retry commit of the attempt (the agent's content of its declared file again). */
async function retryCommit(
  attempt: Awaited<ReturnType<typeof agentAttempt>>,
  spec: Spec,
  agentContent: string,
): Promise<void> {
  await put('src/app.ts', agentContent);
  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
}

/** Every owner write to a document the failed attempt commit holds is refused, nothing written. */
async function ownerWritesOfHeldDocumentsRefused(spec: Spec, attemptId: string) {
  const ledger = () =>
    readLedgerRecord(engine.context, engine.workspace.workspaceId, {
      kind: 'specification',
      id: spec.specId,
    });
  const files = async () => ({
    overview: await readFile(join(root, spec.directory, 'overview.md'), 'utf8'),
    notes: await readFile(join(root, spec.directory, 'notes.md'), 'utf8'),
  });
  const before = { dirty: dirty(), files: await files(), ledger: await ledger() };
  const head = git(root, 'rev-parse', 'HEAD');
  const held = { code: 'DOCUMENT_COMMITS_PENDING', details: { cause: 'attempt-commit' } };

  // The tree says it before the click: the held documents cannot change, the others can.
  const { tree, document } = await treeDocument(spec, 'overview.md');
  expect(tree.attemptCommit).toMatchObject({
    attemptId,
    reason: 'attempt-commit-failed',
    code: 'MANUAL_COMMIT_CONFLICT',
    step: 'requirements',
    attempt: 1,
    paths: expect.arrayContaining(['overview.md', 'notes.md']) as string[],
  });
  expect(document.actions.save).toEqual({ available: false, reason: 'attempt-commit' });

  await expect(ownerSave(spec, 'overview.md', '# The owner’s edit\n')).rejects.toMatchObject({
    ...held,
    message: expect.stringContaining('requirements#1') as string,
  });
  const notes = (await treeDocument(spec, 'notes.md')).document;
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), {
      action: 'rename',
      target: { kind: 'document', documentId: notes.id },
      name: 'renamed.md',
      expectedRevision: notes.revision,
    }),
  ).rejects.toMatchObject(held);
  await expect(
    applyDocumentChange(engine, spec.specId, randomUUID(), {
      action: 'delete',
      target: { kind: 'document', documentId: notes.id },
      expectedRevision: notes.revision,
    }),
  ).rejects.toMatchObject(held);
  // Nothing was written, recorded or committed for the refused writes.
  expect({ dirty: dirty(), files: await files(), ledger: await ledger() }).toEqual(before);
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
}

it('refuses the owner’s writes to the documents a failed attempt commit holds, not to the others, and Close and Abandon, until Retry commit', async () => {
  await autoCommitDocuments(false);
  await pinIntegrationTarget();
  const spec = await newSpecification('Owner waits to edit');
  await put(`${spec.directory}/other.md`, 'Owner notes.\n');
  git(root, 'add', '-A');
  commitStaged(root, 'other document');
  const head = git(root, 'rev-parse', 'HEAD');
  const agentContent = 'export const app = "agent";\n';
  const attempt = await failedAttemptWithDocuments(spec, agentContent);

  await ownerWritesOfHeldDocumentsRefused(spec, attempt.attemptId);

  // The attempt's own Specification cannot end while its commit waits: its exit gate refuses Close.
  // A Close the gate admits meets the agent's files and names the attempt; Abandon waits too.
  const before = await untouched(spec, [siblingSpecId]);
  expect(before.locations).toEqual(['active', 'active']);
  const ownClose = { operationId: randomUUID(), specId: spec.specId };
  await expect(closeSpecification(engine, ownClose)).rejects.toMatchObject({
    code: 'CLOSE_BLOCKED',
    blockers: expect.arrayContaining([
      expect.objectContaining({ kind: 'specification-run' }),
    ]) as object[],
  });
  // The sibling's Close may otherwise archive: never started, nothing unfinished (D07).
  const siblingClose = { operationId: randomUUID(), specId: siblingSpecId };
  await expect(closeSpecification(engine, siblingClose)).rejects.toMatchObject(
    waitingCloseRefusal(attempt.attemptId),
  );
  const abandon = { specId: spec.specId, reason: 'Not needed any more.', actor: owner };
  await expect(abandonSpecification(await openWorkflow(engine), abandon)).rejects.toMatchObject({
    code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED',
  });
  // Nothing was archived, committed, written or discarded for the refused operations.
  expect(await untouched(spec, [siblingSpecId])).toEqual(before);
  // Another document of the Specification stays editable.
  expect((await treeDocument(spec, 'other.md')).document.actions.save).toEqual({
    available: true,
  });
  await ownerSave(spec, 'other.md', 'Owner notes, edited.\n');

  // The agent's content again: one Retry commit makes the one attempt commit, without the owner's file.
  await put('src/app.ts', agentContent);
  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  const [sha, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  const files = filesOf(sha!);
  expect(files).toEqual(
    expect.arrayContaining([
      'src/app.ts',
      `${spec.directory}/overview.md`,
      `${spec.directory}/notes.md`,
    ]),
  );
  expect(files).not.toContain(`${spec.directory}/other.md`);

  // Now the owner's save of the agent's document is admitted; the owner commits both edits.
  expect((await readSpecificationDocumentTree(engine, spec.specId)).attemptCommit).toBeUndefined();
  await ownerSave(spec, 'overview.md', '# The owner’s edit\n');
  await manualCommit(engine, {
    operationId: randomUUID(),
    scope: 'specification',
    specId: spec.specId,
    message: 'docs: owner edits',
  });
  expect(dirty()).toEqual([]);

  // The same Close and Abandon again apply; the agent's code is in its attempt commit only.
  await expect(closeSpecification(engine, siblingClose)).resolves.toMatchObject({
    status: 'completed',
  });
  await abandonSpecification(await openWorkflow(engine), abandon);
  for (const commit of commitsSince(head).filter((commit) => commit !== sha)) {
    expect(filesOf(commit)).not.toContain('src/app.ts');
  }

  expect(git(root, 'show', 'HEAD:src/app.ts')).toBe(agentContent.trim());
  // Only the Abandon's execution state waits (automatic commits off), for the owner's Close.
  expect(dirty().every((path) => path.startsWith(`${spec.directory}/.execution/`))).toBe(true);
}, 600_000);

it('with automatic commits on, commits an attempt’s documents and code as its one attempt commit', async () => {
  await autoCommitDocuments(true);
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
  await autoCommitDocuments(true);
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

it('with automatic commits on, queues no owner commit of a document a failed attempt commit holds, so the first Retry commits it', async () => {
  await autoCommitDocuments(true);
  const spec = await newSpecification('Auto waits to edit');
  const head = git(root, 'rev-parse', 'HEAD');
  const agentContent = 'export const app = "auto agent";\n';
  const attempt = await failedAttemptWithDocuments(spec, agentContent);

  await ownerWritesOfHeldDocumentsRefused(spec, attempt.attemptId);
  expect(commitsSince(head)).toEqual([]);

  await put('src/app.ts', agentContent);
  const [retried] = (
    await retryAgentAttemptCommit(attempt.agent, {
      subject: spec.subject,
      step: 'requirements',
      attempt: 1,
      actor: owner,
    })
  ).postActions;
  expect(retried).toMatchObject({ action: 'attempt-commit', status: 'completed' });
  const [sha] = attemptCommits(attempt.attemptId);
  // No commit of the owner took the agent's document: the attempt commit is the only one.
  expect(commitsSince(head)).toEqual([sha]);
  expect(filesOf(sha!)).toEqual(
    expect.arrayContaining([`${spec.directory}/overview.md`, `${spec.directory}/notes.md`]),
  );
  expect(dirty()).toEqual([]);
}, 600_000);

it('never commits an edit made after a crash at the step publication as the agent’s', async () => {
  await autoCommitDocuments(false);
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

  // No owner write joins the agent's uncommitted work while its commit waits (a new Task included),
  // and the owner's commit of the workflow state never takes what the agent's Turns wrote.
  await expect(
    createTask(await openWorkflow(engine), {
      specId: spec.specId,
      taskId: 'later',
      title: 'Later',
      type: 'implementation',
      actor: owner,
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  const record = await readLedgerRecord(engine.context, engine.workspace.workspaceId, {
    kind: 'specification',
    id: spec.specId,
  });
  const agents = (record?.entries ?? [])
    .filter((entry) => ledgerAuthorsOf(entry).executions.length > 0)
    .map((entry) => entry.path);
  expect(agents.some((path) => path.startsWith(`${spec.directory}/.execution/`))).toBe(true);
  const attemptExecutions = await engine.attemptCommitExecutions?.(engine.workspace.workspaceId);
  const outcome = await commitExecutionState(engine, spec.specId, {
    phrase: 'add a Task',
    ...(attemptExecutions ? { attemptExecutions } : {}),
  });
  expect(outcome).toEqual({ kind: 'nothing-to-commit' });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect(dirty()).toEqual(expect.arrayContaining(agents));
}, 600_000);

it('refuses worktree Close and Abandon while the attempt commit failed in the worktree, then admits the Close after Retry commit', async () => {
  await autoCommitDocuments(false);
  await pinIntegrationTarget();
  const primary = root;
  const created = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Worktree waits',
    created: '2026-11-23',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'new-worktree', baseRef: 'HEAD' },
  });
  expect(dirname(created.workspaceRoot)).not.toBe(dirname(primary));
  cleanup.push(dirname(created.workspaceRoot));
  // From here on the case's checkout is the Specification's worktree.
  root = created.workspaceRoot;
  git(root, 'add', '-A');
  commitStaged(root, 'Specification source');
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  const spec: Spec = {
    specId: created.specId,
    directory: 'specs/active/' + created.slug,
    subject: { kind: 'specification', specId: created.specId },
  };
  const agentContent = 'export const app = "worktree";\n';
  const attempt = await failedAttemptWithDocuments(spec, agentContent, {
    workspaceId: created.workspaceId,
  });

  const state = async () => ({
    checkout: await untouched(spec),
    primary: git(primary, 'rev-parse', 'HEAD'),
    branch: git(primary, 'rev-parse', branch),
    worktree: (await lstat(root)).isDirectory(),
    binding: (await engine.readRegistry()).specBindings.find(
      (binding) => binding.specId === spec.specId,
    ),
  });
  const before = await state();
  expect(before.binding).toMatchObject({ workspaceId: created.workspaceId });
  expect(before.checkout.dirty).toEqual(expect.arrayContaining(agentPaths(spec)));

  const close = { operationId: randomUUID(), specId: spec.specId };
  await expect(closeWorktree(engine, close)).rejects.toMatchObject(
    waitingCloseRefusal(attempt.attemptId),
  );
  await expect(
    abandonSpecification(await openWorkflow(engine), {
      specId: spec.specId,
      reason: 'Not needed any more.',
      actor: owner,
    }),
  ).rejects.toMatchObject({ code: 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED' });
  // No checkout removed, no branch closed or merged, the agent's files as it left them.
  expect(await state()).toEqual(before);

  await retryCommit(attempt, spec, agentContent);
  expect(dirty()).toEqual([]);

  // The agent's work is in its one attempt commit on the worktree's branch, and the same Close is
  // admitted now: its preview runs the checks that refused it and would integrate the branch (the
  // integration itself is Close's own, covered by the lifecycle tests).
  const [attemptCommit, ...others] = attemptCommits(attempt.attemptId);
  expect(others).toEqual([]);
  expect(filesOf(attemptCommit!)).toEqual(expect.arrayContaining(agentPaths(spec)));
  expect(git(root, 'show', 'HEAD:src/app.ts')).toBe(agentContent.trim());
  const preview = await previewPublicCloseOperation(engine, { kind: 'worktree-close', ...close });
  expect(preview.merge).toMatchObject({
    status: 'integrates',
    sourceBranch: branch,
    targetBranch: 'feature/work',
  });
}, 600_000);
