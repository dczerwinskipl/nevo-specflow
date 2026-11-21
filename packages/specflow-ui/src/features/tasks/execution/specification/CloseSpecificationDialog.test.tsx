// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloseMerge, RepositoryBlocker } from '@nevo/specflow-contracts/specs';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import type { WorkspaceList } from '@nevo/specflow-contracts/workspaces';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../../test-support/app/stubLayoutApis';
import type { TaskProgressData } from '../../../specs/read-model';
import { refusal } from '../../authoring/authoring.test-support';
import type { WorkflowExecutionApi } from '../api';
import { SPEC, specificationWorkflowProjection } from '../projections.stories-support';
import type { BlockerTask } from './BlockerGroups';
import {
  CloseSpecificationDialog,
  type CloseSpecificationDialogProps,
} from './CloseSpecificationDialog';

afterEach(cleanup);

const never = () => new Promise<never>(() => undefined);
const integrates: CloseMerge = {
  status: 'integrates',
  sourceBranch: 'nevo-1/sso',
  targetBranch: 'release/2026.11',
  commitsAhead: 2,
};
const planned = (merge: CloseMerge = integrates) => ({ operationId: 'op-1', merge });
const done = (id: string): [string, BlockerTask] => [
  id,
  { id, title: `Task ${id}`, state: 'Done', statusId: 'completed' },
];
const WORKTREE = '7b1e2c3d-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const workspaces: WorkspaceList = {
  projectFolderId: WORKTREE,
  workspaces: [
    {
      workspaceId: WORKTREE,
      kind: 'linked',
      name: 'nevo-1',
      path: 'D:\\repos\\acme\\.nevo\\worktrees\\nevo-1',
      available: true,
      isRuntimeWorkspace: false,
      specifications: [],
    },
  ],
};

function renderDialog({
  closePreview,
  close = vi.fn(never),
  tasks = new Map([done('t-1'), done('t-2')]),
  progress = { completed: 2, total: 2 },
  projection = specificationWorkflowProjection('completed'),
  listWorkspaces = () => Promise.resolve(workspaces),
  getTaskList = never,
  documents,
  onOpenSpecification = vi.fn(),
  retryAttemptCommit = vi.fn(never),
}: {
  readonly closePreview: WorkflowExecutionApi['closePreview'];
  readonly close?: WorkflowExecutionApi['close'];
  readonly tasks?: ReadonlyMap<string, BlockerTask>;
  readonly progress?: TaskProgressData;
  readonly projection?: WorkflowActionProjection;
  readonly listWorkspaces?: () => Promise<WorkspaceList>;
  readonly getTaskList?: () => Promise<never>;
  readonly documents?: CloseSpecificationDialogProps['documents'];
  readonly onOpenSpecification?: (specId: string) => void;
  readonly retryAttemptCommit?: WorkflowExecutionApi['retryAttemptCommit'];
}) {
  stubLayoutApis();
  const workflowExecutionApi: WorkflowExecutionApi = {
    start: vi.fn(never),
    finish: vi.fn(never),
    returnTo: vi.fn(never),
    reevaluateWait: vi.fn(never),
    abandon: vi.fn(never),
    checkAgentExecution: vi.fn(never),
    startAgentExecution: vi.fn(never),
    closePreview,
    stopAgentExecution: vi.fn(never),
    retryAttemptCommit,
    confirmResult: vi.fn(never),
    takeOverAgentExecution: vi.fn(never),
    history: vi.fn(never),
    rejectResult: vi.fn(never),
    closeOccupancy: vi.fn(() => Promise.resolve({ blockers: [] })),
    close,
  };
  const defaults = createSpecFlowAppServices();
  const services = createSpecFlowAppServices({
    workflowExecutionApi,
    workspaceApi: { list: listWorkspaces },
    taskApi: { ...defaults.taskApi, getTaskList },
  });

  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <CloseSpecificationDialog
            open
            onOpenChange={vi.fn()}
            specId={SPEC}
            specTitle="SSO sign-in"
            projection={projection}
            tasks={tasks}
            progress={progress}
            {...(documents ? { documents } : {})}
            onAbandonInstead={vi.fn()}
            onSeeWorkflow={vi.fn()}
            onSeeTasks={vi.fn()}
            onOpenTask={vi.fn()}
            onOpenSpecification={onOpenSpecification}
            onClosed={vi.fn()}
          />
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );

  return screen.getByRole('dialog');
}

const uncommitted: RepositoryBlocker = {
  kind: 'uncommitted-changes',
  checkout: 'specification',
  workspaceId: WORKTREE,
  paths: [
    { path: 'specs/active/sso/overview.md', scope: 'specification' },
    { path: 'scratch-notes.txt', scope: 'other' },
  ],
  count: 2,
  specificationCount: 1,
};

function dirtyPreview() {
  const dirty = refusal('CLOSE_PREFLIGHT', 422);
  (dirty.cause as { data: Record<string, unknown> }).data.repository = [uncommitted];

  return dirty;
}

const fact = (dialog: HTMLElement, term: string) =>
  within(dialog).getByText(term).nextElementSibling?.textContent;

describe('agent work whose commit failed', () => {
  const attempt = {
    attemptId: '5d1c1a52-8f3e-4a6b-9a0e-3b7f2c9d1e44',
    specId: SPEC,
    taskId: 't-04',
    step: 'implement',
    attempt: 2,
    stepTitle: 'Implementation',
    code: 'COMMIT_BLOCKED',
    count: 7,
    paths: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
  };

  it('lists the attempt in its own group and retries its commit, then checks again', async () => {
    const preview = refusal('CLOSE_PREFLIGHT', 422);
    (preview.cause as { data: Record<string, unknown> }).data.repository = [
      { ...uncommitted, paths: [], count: 0, specificationCount: 0, attempts: [attempt] },
    ];
    const closePreview = vi
      .fn<WorkflowExecutionApi['closePreview']>()
      .mockRejectedValueOnce(preview)
      .mockResolvedValue(planned());
    const retryAttemptCommit = vi.fn(() => Promise.resolve({} as never));
    const dialog = renderDialog({ closePreview, retryAttemptCommit });

    expect(
      await within(dialog).findByRole('heading', { name: 'Agent work whose commit failed · 7' }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Implementation of t-04, attempt 2: the commit failed: a Git hook/),
    ).toBeTruthy();
    expect(within(dialog).getByText('and 2 more')).toBeTruthy();
    // Nothing else is left uncommitted: no second group, and no discard warning.
    expect(within(dialog).queryByText(/Uncommitted files in this checkout/)).toBeNull();
    expect(within(dialog).queryByText('Commit them first.')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry commit of Implementation' }));

    await waitFor(() =>
      expect(retryAttemptCommit).toHaveBeenCalledWith(
        { specId: SPEC, taskId: 't-04' },
        { step: 'implement', attempt: 2 },
      ),
    );
    expect(await within(dialog).findByText('Ready to close')).toBeTruthy();
    expect(closePreview).toHaveBeenCalledTimes(2);
  });

  it('says the retry was refused and stays', async () => {
    const hold = refusal('DOCUMENT_COMMITS_PENDING', 409, {
      cause: 'commit-uncommitted',
      uncommitted: { reasons: [], owners: [], attempts: [attempt], unreadable: 0 },
    });
    const dialog = renderDialog({
      closePreview: vi.fn(() => Promise.reject(hold)),
      retryAttemptCommit: vi.fn(() => Promise.reject(refusal('COMMIT_BLOCKED', 409))),
    });

    expect(
      await within(dialog).findByText(/An agent finished its work, but its commit failed/),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry commit of Implementation' }));

    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeTruthy();
  });
});

describe('CloseSpecificationDialog', () => {
  it('names uncommitted files and the discard warning before any press, then checks again to ready', async () => {
    const closePreview = vi
      .fn<WorkflowExecutionApi['closePreview']>()
      .mockRejectedValueOnce(dirtyPreview())
      .mockResolvedValue(planned());
    const dialog = renderDialog({ closePreview });

    expect(
      await within(dialog).findByText('SSO sign-in cannot close yet: 1 repository problem.'),
    ).toBeTruthy();
    // The specification's own file is marked; a file elsewhere in the checkout is not.
    expect(
      within(dialog).getByText('specs/active/sso/overview.md').parentElement?.textContent,
    ).toBe('specs/active/sso/overview.md (this specification)');
    expect(within(dialog).getByText('scratch-notes.txt').parentElement?.textContent).toBe(
      'scratch-notes.txt',
    );
    // The checkout's path comes from the registered workspaces, not from the refusal.
    expect(
      await within(dialog).findByText('D:\\repos\\acme\\.nevo\\worktrees\\nevo-1'),
    ).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copy path' })).toBeTruthy();
    expect(within(dialog).getByText('Commit them first.')).toBeTruthy();
    expect(
      within(dialog).getByText(/If you discard them instead \(for example with git restore/u),
    ).toBeTruthy();
    // Committing is the way forward; the dialog never offers to discard.
    expect(within(dialog).queryByRole('button', { name: /discard/i })).toBeNull();
    // Abandoning needs the same repository checks: not offered for them.
    expect(within(dialog).queryByRole('button', { name: 'Abandon instead' })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Check again' }));

    expect(await within(dialog).findByText('Ready to close')).toBeTruthy();
    expect(closePreview).toHaveBeenCalledTimes(2);
    expect(fact(dialog, 'Merges')).toBe('nevo-1/sso → release/2026.11');
    expect(fact(dialog, 'Tasks')).toBe('All 2 tasks done');
    expect(
      within(dialog).getByText('Closing archives the specification; it cannot be reopened.'),
    ).toBeTruthy();
  });

  it('names the checkout without a path to copy when the workspaces cannot be read', async () => {
    const dialog = renderDialog({
      closePreview: vi.fn(() => Promise.reject(dirtyPreview())),
      listWorkspaces: () => Promise.reject(refusal('FORBIDDEN', 403)),
    });

    expect(
      await within(dialog).findByText(
        'Commit them in this checkout (or move the ones that do not belong here), then check again.',
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Copy path' })).toBeNull();
  });

  it('replaces ready with a refused Close, and checks again from there', async () => {
    const closePreview = vi.fn(() => Promise.resolve(planned()));
    const close = vi.fn(() => Promise.reject(refusal('CLOSE_CONFLICT', 409)));
    const dialog = renderDialog({ closePreview, close });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Close and archive' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Not closed');
    expect(within(dialog).queryByText('Ready to close')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check again' }));

    expect(await within(dialog).findByText('Ready to close')).toBeTruthy();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await waitFor(() => expect(closePreview).toHaveBeenCalledTimes(2));
  });

  it('says what it merges, or why it merges nothing', async () => {
    const merges = async (merge: CloseMerge) => {
      const dialog = renderDialog({ closePreview: vi.fn(() => Promise.resolve(planned(merge))) });
      await within(dialog).findByText('Ready to close');
      const text = [
        fact(dialog, 'Merges'),
        within(dialog).queryByText('The workflow is complete and the repository checks passed.')
          ? 'checks passed'
          : within(dialog).getByText(/Git is off, so nothing is merged/).textContent,
      ];
      cleanup();

      return text;
    };

    expect((await merges({ ...integrates, commitsAhead: 0 }))[0]).toBe('Nothing to merge');
    expect(
      (
        await merges({
          status: 'not-integrated',
          reason: 'primary-checkout',
          sourceBranch: 'develop',
        })
      )[0],
    ).toBe('Archives on develop (main folder; nothing to merge)');
    // Git off: no repository check ran, and the alert does not claim one passed.
    expect(
      await merges({ status: 'not-integrated', reason: 'git-off', checkout: 'primary' }),
    ).toEqual([
      'Archives without Git (Git is off for this project)',
      'The workflow is complete. Git is off, so nothing is merged.',
    ]);
  });

  it('shows the running Close busy, with Cancel off', async () => {
    const dialog = renderDialog({ closePreview: vi.fn(() => Promise.resolve(planned())) });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Close and archive' }));

    const busy = await within(dialog).findByRole<HTMLButtonElement>('button', { name: 'Closing…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(
      true,
    );
  });

  it("reads the Tasks fact from the Runtime's counts in Now's words, and names the cancelled ones", async () => {
    const dialog = renderDialog({
      closePreview: vi.fn(() => Promise.resolve(planned())),
      projection: specificationWorkflowProjection('abandoned'),
      tasks: new Map([
        done('t-1'),
        ['t-2', { id: 't-2', title: 'Two', state: 'Cancelled', statusId: 'cancelled' }],
      ]),
      progress: { completed: 1, total: 1, cancelled: 1 },
    });
    await within(dialog).findByText('Recorded as not delivered');

    expect(fact(dialog, 'Tasks')).toBe('1 task cancelled · 1 done');
    expect(within(dialog).getByRole('region', { name: 'Cancelled, not delivered' })).toBeTruthy();
  });

  it('names the documents still only their initial content last, and leaves the fact out without them', async () => {
    const doc = (id: string, contentState?: 'baseline' | 'authored') => ({
      id,
      title: id,
      filename: `${id}.md`,
      ...(contentState ? { contentState } : {}),
    });
    const dialog = renderDialog({
      closePreview: vi.fn(() => Promise.resolve(planned())),
      documents: [
        doc('overview', 'authored'),
        doc('ux', 'baseline'),
        doc('backend', 'baseline'),
        doc('notes'),
        doc('research', 'baseline'),
        doc('decisions', 'baseline'),
      ],
    });
    await within(dialog).findByText('Ready to close');

    expect(fact(dialog, 'Documents')).toBe(
      '4 with initial content only: ux.md, backend.md, research.md, +1 more',
    );
    const terms = [...dialog.querySelectorAll('dt')].map((term) => term.textContent);
    expect(terms.at(-1)).toBe('Documents');
    cleanup();

    const none = renderDialog({
      closePreview: vi.fn(() => Promise.resolve(planned())),
      documents: [doc('overview', 'authored')],
    });
    await within(none).findByText('Ready to close');
    expect(within(none).queryByText('Documents')).toBeNull();
  });

  it('gives a held blocking Task its hold reason, as the Tasks page row does', async () => {
    const dialog = renderDialog({
      closePreview: vi.fn(never),
      projection: specificationWorkflowProjection('close-blocked'),
      tasks: new Map([
        ['t-03', { id: 't-03', title: 'Sign-in button', state: 'On hold', statusId: 'on-hold' }],
      ]),
      getTaskList: () =>
        Promise.resolve({
          groups: [{ tasks: [{ id: 't-03', holdReason: 'Waiting for the sandbox account.' }] }],
        } as never),
    });

    expect(await within(dialog).findByText('Waiting for the sandbox account.')).toBeTruthy();
    // As on a Task row: the title first, the id on its own secondary line, at every width.
    const row = dialog.querySelector<HTMLElement>('[data-task-id="t-03"]')!;
    expect([...row.children].map((line) => line.textContent)).toEqual([
      'Sign-in button',
      't-03',
      'On hold',
      'Waiting for the sandbox account.',
    ]);
  });

  it('presents files of another specification as a hold, with its name as a link', async () => {
    const OTHER = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
    const owner = (specId: string, title: string) => ({
      kind: 'specification' as const,
      specId,
      title,
      workflowState: 1,
      documents: 0,
      count: 1,
      paths: [`specs/active/${title}/.execution/specification.yaml`],
    });
    const held = refusal('DOCUMENT_COMMITS_PENDING', 409, {
      cause: 'commit-uncommitted',
      uncommitted: {
        reasons: ['auto-commit-off'],
        owners: [owner(OTHER, 'passkeys'), owner(SPEC, 'sso')],
        unreadable: 0,
      },
    });
    const onOpenSpecification = vi.fn();
    const dialog = renderDialog({
      closePreview: vi.fn(() => Promise.reject(held)),
      onOpenSpecification,
    });

    expect(
      await within(dialog).findByText(
        'SSO sign-in cannot close yet: another specification has uncommitted changes in this checkout.',
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    // Check again is the primary action, Dismiss secondary.
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeTruthy();
    // This specification is named, not linked.
    expect(within(dialog).queryByRole('button', { name: /sso/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'passkeys' }));
    expect(onOpenSpecification).toHaveBeenCalledWith(OTHER);
  });
});
