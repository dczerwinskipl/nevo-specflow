import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SpecFlowEngine } from '../../../../application';
import type { ResolvedProjectHome } from '../../../../project/home/home';
import {
  attemptCommitHeld,
  readableAttemptCommitHolds,
} from '../../../../specs/documents/attempt-commit-hold';
import { ledgerPath } from '../../../../specs/durable';
import { specificationWaitOf } from '../../../attempt-commit-admission';
import type { AgentAttemptJournal } from '../../journal/model';
import { attemptCommitHoldsOf, readAttemptCommitHolds } from './holds';

const SPEC = 'spec-1';
const WORKSPACE = 'workspace-1';

// The ledger is the real one on disk; the Git policy and the journal listing are stand-ins.
const listed = vi.hoisted(() => ({ journals: [] as AgentAttemptJournal[] }));
vi.mock('../../../../version-control/worktrees/config', () => ({
  readProjectGitPolicy: () => Promise.resolve({ policy: { enabled: true }, revision: 'r' }),
}));
vi.mock('../../journal/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../journal/store')>()),
  filesystemAgentAttemptJournal: () => ({
    listActive: () =>
      Promise.resolve({ journals: listed.journals, unreadable: [], truncated: false }),
  }),
}));

const roots: string[] = [];
afterEach(async () => {
  listed.journals = [];
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('the attempt commit holds of a checkout', () => {
  it('are none while every journal is read and none waits', () => {
    const holds = attemptCommitHoldsOf(
      { journals: [], unreadable: [], truncated: false },
      WORKSPACE,
      [],
    );
    expect(holds).toEqual({ readable: true, holds: [], executions: new Set() });
    expect(specificationWaitOf(holds, SPEC)).toBeUndefined();
  });

  it.each([
    ['a journal cannot be read', { unreadable: ['2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02'] }],
    ['the listing was cut short', { truncated: true }],
  ])('fail closed when %s: the unread journal may be the one that waits', (_name, listing) => {
    const holds = attemptCommitHoldsOf(
      { journals: [], unreadable: [], truncated: false, ...listing },
      WORKSPACE,
      [],
    );
    expect(holds).toEqual({ readable: false });
    expect(() => specificationWaitOf(holds, SPEC)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }),
    );
  });
});

describe('the attempt commit holds read from the project', () => {
  it('fail closed when a ledger record of the checkout cannot be read: Close and the commits refuse', async () => {
    const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'specflow-holds-')));
    roots.push(stateRoot);
    const context = { project: { stateRoot } } as unknown as ResolvedProjectHome;
    const workspaceId = randomUUID();
    const specId = randomUUID();
    // A finished attempt of the checkout whose own commit has not run yet.
    listed.journals = [
      {
        operationId: randomUUID(),
        workspaceId,
        subject: { kind: 'specification', specId },
        step: 'write',
        attempt: 1,
        postActions: [{ kind: 'attempt-commit', state: 'pending', stepTitle: 'Write it' }],
      } as unknown as AgentAttemptJournal,
    ];
    const record = ledgerPath(context, workspaceId, { kind: 'specification', id: specId });
    await mkdir(dirname(record), { recursive: true });
    await writeFile(record, 'not json');

    const holds = await readAttemptCommitHolds({ context } as SpecFlowEngine, workspaceId);
    expect(holds).toEqual({ readable: false });
    const engine = {
      attemptCommitHolds: () => Promise.resolve(holds),
    } as unknown as SpecFlowEngine;
    const refusal = {
      code: 'COMMIT_BLOCKED',
      details: { blockedBy: 'attempt-record-unreadable' },
    };
    await expect(readableAttemptCommitHolds(engine, workspaceId)).rejects.toMatchObject(refusal);
    expect(attemptCommitHeld(holds, ['src/app.ts'], 'commit', () => false)).toMatchObject(refusal);
  });
});
