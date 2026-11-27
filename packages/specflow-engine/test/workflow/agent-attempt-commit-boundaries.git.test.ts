// Integration (real project, real Git): what the one commit of an agent attempt (D15) holds across
// the owner's Confirm, a crash during its finalize, automatic document commits and the workflow
// writes refused while it waits. Close, Abandon and the manual commit while it waits are in
// `agent-attempt-close-boundaries.git.test.ts`. Each case runs on a checkout of its own, a copy of
// one initialised template (`../support/agent-attempt-project.ts`), with its commit policy set
// explicitly; each runs a real attempt on a Specification of its own.
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import {
  abandonSpecification,
  confirmAgentResult,
  createTask,
  finishStep,
  inspectActions,
  openWorkflow,
  rejectAgentResult,
  retryAgentAttemptCommit,
  returnDuringAgentAttempt,
  startAgentAttempt,
  takeOverAgentAttempt,
} from '../../src/testing';
import { commitExecutionState } from '../../src/specs/documents/execution-state-commit';
import { readLedgerRecord } from '../../src/specs/durable';
import { ledgerAuthorsOf } from '../../src/specs/durable/ledger/model';
import {
  agentAttempt,
  attemptCommits,
  autoCommitDocuments,
  commitsSince,
  dirty,
  engine,
  failedAttemptWithDocuments,
  filesOf,
  newSpecification,
  owner,
  ownerStep,
  ownerWritesOfHeldDocumentsRefused,
  put,
  root,
  saveDocument,
  subjectOf,
  toBreakdownReview,
  useAttemptProject,
} from '../support/agent-attempt-project';
import { git } from '../support/git-project';

useAttemptProject('specflow-attempt-boundaries-');

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
  const outcome = await commitExecutionState(engine, spec.specId, { phrase: 'add a Task' });
  expect(outcome).toEqual({ kind: 'nothing-to-commit' });
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect(dirty()).toEqual(expect.arrayContaining(agents));
}, 600_000);
