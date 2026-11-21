import { describe, expect, it } from 'vitest';
import { CloseOperationError, DocumentError, type SpecFlowEngine } from '@nevo/specflow-engine';
import { reportOf } from '../documents/report';
import { uncommittedChangesLines } from '../documents/uncommitted-groups';
import { ReportedFailure } from '../exit-code';
import {
  ARCHIVED_WITHOUT_GIT,
  integrationTargetMissingLines,
  previewCloseForCli,
  reportingRepositoryBlockers,
  withoutGitLines,
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
      reportingRepositoryBlockers(
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

  it('says a Close without Git archives in place, and what stays uncommitted in a worktree', () => {
    expect(withoutGitLines('primary')).toEqual([ARCHIVED_WITHOUT_GIT]);
    expect(ARCHIVED_WITHOUT_GIT).toBe(
      'Without Git (Git is off for this project): the Specification is archived in place; nothing is committed or merged.',
    );
    expect(withoutGitLines('linked')).toEqual([
      ARCHIVED_WITHOUT_GIT,
      'The archive stays uncommitted in the linked worktree: commit it there before closing the worktree with Git on.',
    ]);
  });

  it('leaves any other refusal to the caller', async () => {
    const other = new CloseOperationError('CLOSE_PREFLIGHT', 'Dirty.');
    await expect(
      reportingRepositoryBlockers({ stdout: () => undefined, stderr: () => undefined }, false, () =>
        Promise.reject(other),
      ),
    ).rejects.toBe(other);
  });
});

describe('CLI Close preview with uncommitted changes', () => {
  const self = '00000000-0000-4000-8000-0000000000aa';
  const other = '00000000-0000-4000-8000-0000000000bb';
  const blocker = {
    kind: 'uncommitted-changes',
    checkout: 'specification',
    workspaceId: 'ws-1',
    paths: [
      { path: 'specs/active/a/doc.md', scope: 'specification' },
      { path: 'NOTES.md', scope: 'other' },
    ],
    count: 2,
    specificationCount: 1,
  } as const;
  const run = async (error: Error, json: boolean) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    await expect(
      reportingRepositoryBlockers(
        { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
        json,
        () => Promise.reject(error),
        self,
      ),
    ).rejects.toBeInstanceOf(ReportedFailure);

    return { stdout, stderr };
  };

  it('prints one group with a remedy per kind and no discard, in text and --json', async () => {
    const { stdout, stderr } = await run(
      new CloseOperationError('CLOSE_PREFLIGHT', 'Dirty.', { repository: [blocker] }),
      true,
    );
    expect(stderr).toEqual([
      'CLOSE_PREFLIGHT: Dirty.',
      'Uncommitted changes: 2. Closing starts from a committed checkout, and SpecFlow never discards work.',
      'Saved in SpecFlow, not committed yet: 1',
      '  ' + self + ' (this specification): 1',
      '    specs/active/a/doc.md',
      '  Remedy: Commit this specification\'s files with "nevo-specflow commit --spec ' +
        self +
        '" (see them with "nevo-specflow commit status"), or with Git.',
      'Changed outside SpecFlow: 1 (the specification checkout, workspace ws-1)',
      '  NOTES.md',
      '  Remedy: Commit them with Git in the specification checkout (workspace ws-1) or move them out of it. SpecFlow does not discard them: Git keeps no copy of uncommitted work.',
    ]);
    const { error } = JSON.parse(stdout[0] ?? '{}') as {
      error: { repository: unknown; uncommitted: { groups: { kind: string }[] } };
    };
    expect(error.repository).toEqual([blocker]);
    expect(error.uncommitted.groups.map((group) => group.kind)).toEqual([
      'saved-not-committed',
      'changed-outside',
    ]);
  });

  it('lists the work of an agent attempt whose commit failed first, with the retry command', async () => {
    const attempt = {
      attemptId: '2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02',
      specId: self,
      taskId: 'api',
      step: 'implement',
      attempt: 2,
      stepTitle: 'Implement',
      code: 'MANUAL_COMMIT_CONFLICT',
      count: 2,
      paths: ['src/app.ts', 'specs/active/a/tasks/api/notes.md'],
    };
    const { stderr } = await run(
      new CloseOperationError('CLOSE_PREFLIGHT', 'Dirty.', {
        repository: [{ ...blocker, attempts: [attempt] }],
      }),
      false,
    );
    expect(stderr.slice(1, 8)).toEqual([
      'Uncommitted changes: 4. Closing starts from a committed checkout, and SpecFlow never discards work.',
      'Agent work whose commit failed: 2',
      '  Task api, "Implement" attempt 2 (MANUAL_COMMIT_CONFLICT): 2',
      '    src/app.ts',
      '    specs/active/a/tasks/api/notes.md',
      '    Retry: nevo-specflow workflow retry-commit ' +
        self +
        ' --task api --step implement --attempt 2',
      "  Remedy: Fix the cause, then retry the attempt commit (Retry commit, or the command under each attempt); it commits exactly the attempt's files and nothing of anyone else.",
    ]);
    expect(stderr[8]).toBe('Saved in SpecFlow, not committed yet: 1');
  });

  it('keeps every path in --json, shows five in text, and labels owners only when known', () => {
    const paths = Array.from({ length: 7 }, (_, index) => 'specs/active/o/d' + index + '.md');
    const hold = {
      reasons: ['auto-commit-off'],
      owners: [
        {
          kind: 'specification',
          specId: other,
          title: 'Other',
          workflowState: 0,
          documents: 9,
          count: 9,
          paths,
        },
      ],
      unreadable: 0,
    };
    const refusal = (known: boolean) =>
      reportOf(
        new DocumentError('DOCUMENT_COMMITS_PENDING', 'Held.', {
          reason: 'busy',
          cause: 'commit-uncommitted',
          uncommitted: hold,
        } as never),
        known ? self : undefined,
      ).uncommitted;
    const known = refusal(true);
    expect(known?.groups[0]?.owners?.[0]).toMatchObject({ relation: 'other', paths, more: 2 });
    expect(uncommittedChangesLines(known as never).slice(2)).toEqual([
      '  Other (another specification): 9',
      ...paths.slice(0, 5).map((path) => '    ' + path),
      '    and 4 more',
      expect.stringContaining("Commit another specification's files") as string,
    ]);
    const unknown = refusal(false);
    expect(unknown?.groups[0]?.owners?.[0]?.relation).toBeUndefined();
    expect(uncommittedChangesLines(unknown as never)[2]).toBe('  Other: 9');
    expect(unknown?.groups[0]?.remedy).not.toContain('another specification');
  });

  it('names another specification with its remedy when a hold lists it', () => {
    const hold = {
      reasons: ['auto-commit-off'],
      owners: [
        {
          kind: 'specification',
          specId: other,
          title: 'Other',
          workflowState: 1,
          documents: 0,
          stepInProgress: true,
          count: 1,
          paths: ['specs/active/o/.execution/run.json'],
        },
      ],
      unreadable: 0,
    };
    const report = reportOf(
      new DocumentError('DOCUMENT_COMMITS_PENDING', 'Held.', {
        reason: 'busy',
        cause: 'commit-uncommitted',
        uncommitted: hold,
      } as never),
      self,
    );
    expect(report.uncommitted?.groups).toMatchObject([
      {
        kind: 'saved-not-committed',
        count: 1,
        owners: [{ specId: other, title: 'Other', stepInProgress: true, more: 0 }],
        remedy: expect.stringContaining('finish its step in progress there') as string,
      },
    ]);
  });
});
