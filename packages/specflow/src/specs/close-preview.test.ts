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
    sourceCheckout: 'linked',
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
      "No integration branch is configured: git.integrationTargetBranch in .nevo/config.yaml names none. Closing merges this worktree's branch into the integration branch.",
      'Candidates (none is chosen for you):',
      "  release/2026.11: default branch of remote origin; this worktree's branch started from it; merges into release/2026.11",
      '  develop: checked out in the main folder; merges into develop',
      'Other local branches: hotfix and 2 more',
      'Choose the branch, set git.integrationTargetBranch in .nevo/config.yaml, then preview again.',
    ]);
  });

  it('says that no local branch can receive it when the repository has none to offer', () => {
    expect(
      integrationTargetMissingLines({
        kind: 'integration-target-missing',
        sourceCheckout: 'linked',
        candidates: [],
        otherBranches: [],
        otherBranchCount: 0,
      }),
    ).toContain(
      'No local branch can receive it. Create the integration branch in the repository, then preview again.',
    );
  });

  it('words a primary-checkout Close as archiving on the branch, with nothing to merge', () => {
    const lines = integrationTargetMissingLines({
      kind: 'integration-target-missing',
      sourceCheckout: 'primary',
      candidates: [{ branch: 'develop', facts: ['primary-checkout'] }],
      otherBranches: [],
      otherBranchCount: 0,
    });
    expect(lines[0]).toContain('archives the Specification directly on the integration branch');
    expect(lines[0]).not.toContain('merges');
    expect(lines).toContain(
      '  develop: checked out in the main folder; archives on develop (main folder; nothing to merge)',
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
