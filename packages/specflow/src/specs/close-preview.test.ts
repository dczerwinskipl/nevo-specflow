import { describe, expect, it } from 'vitest';
import { CloseOperationError, type SpecFlowEngine } from '@nevo/specflow-engine';
import { ReportedFailure } from '../exit-code';
import {
  integrationTargetMissingLines,
  previewCloseForCli,
  reportingMissingIntegrationTarget,
} from './close-preview';

const specId = '00000000-0000-4000-8000-000000000001';
const engine = {} as SpecFlowEngine;
const plan = { kind: 'plan' } as never;
const sessionBlocker = {
  kind: 'session-turn-running',
  subjectIds: ['session-1'],
  message: 'An agent works there.',
};
const busy = () => Promise.resolve(sessionBlocker);
const quiet = () => Promise.resolve(undefined);

describe('CLI Close preview', () => {
  it('refuses like Close while an agent Session works in the checkout Close removes', async () => {
    await expect(
      previewCloseForCli(
        engine,
        { kind: 'worktree-close', specId },
        { preview: () => Promise.resolve(plan), occupancy: busy },
      ),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [sessionBlocker] });
  });

  it('lists the session blocker beside the workflow blockers', async () => {
    const workflow = { kind: 'draft-tasks', subjectIds: ['t-1'], message: 'Approve t-1.' };
    await expect(
      previewCloseForCli(
        engine,
        { kind: 'specification-close', specId },
        {
          preview: () =>
            Promise.reject(
              new CloseOperationError('CLOSE_BLOCKED', 'Blocked.', { blockers: [workflow] }),
            ),
          occupancy: busy,
        },
      ),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [workflow, sessionBlocker] });
  });

  it('returns the plan when Close would not ask about a running agent', async () => {
    await expect(
      previewCloseForCli(
        engine,
        { kind: 'specification-close', specId },
        { preview: () => Promise.resolve(plan), occupancy: quiet },
      ),
    ).resolves.toBe(plan);
  });
});

describe('CLI Close preview without an integration branch', () => {
  const blocker = {
    kind: 'integration-target-missing',
    candidates: [
      { branch: 'release/2026.11', facts: ['remote-default', 'started-from'], remote: 'origin' },
      { branch: 'develop', facts: ['primary-checkout'] },
    ],
    otherBranches: ['hotfix'],
    otherBranchCount: 3,
  } as const;

  it('lists the candidates with their facts and the other branches, choosing none', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    await expect(
      reportingMissingIntegrationTarget(
        { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
        false,
        () =>
          Promise.reject(
            new CloseOperationError('CLOSE_PREFLIGHT', 'No target.', { repository: [blocker] }),
          ),
      ),
    ).rejects.toBeInstanceOf(ReportedFailure);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      'CLOSE_PREFLIGHT: No target.',
      "No integration branch is configured: closing merges into the project's integration branch, and git.integrationTargetBranch in .nevo/config.yaml names none.",
      'Candidates (none is chosen for you):',
      "  release/2026.11: default branch of remote origin; this worktree's branch started from it",
      '  develop: checked out in the main folder',
      'Other local branches: hotfix and 2 more',
      'Choose the branch, set git.integrationTargetBranch in .nevo/config.yaml, then preview again.',
    ]);
  });

  it('says that no local branch can receive it when the repository has none to offer', () => {
    expect(
      integrationTargetMissingLines({
        kind: 'integration-target-missing',
        candidates: [],
        otherBranches: [],
        otherBranchCount: 0,
      }),
    ).toContain(
      'No local branch can receive it. Create the integration branch in the repository, then preview again.',
    );
  });

  it('leaves any other refusal to the caller', async () => {
    const other = new CloseOperationError('CLOSE_PREFLIGHT', 'Dirty.');
    await expect(
      reportingMissingIntegrationTarget(
        { stdout: () => undefined, stderr: () => undefined },
        false,
        () => Promise.reject(other),
      ),
    ).rejects.toBe(other);
  });
});
