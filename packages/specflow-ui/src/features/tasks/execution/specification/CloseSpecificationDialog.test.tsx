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
}: {
  readonly closePreview: WorkflowExecutionApi['closePreview'];
  readonly close?: WorkflowExecutionApi['close'];
  readonly tasks?: ReadonlyMap<string, BlockerTask>;
  readonly progress?: TaskProgressData;
  readonly projection?: WorkflowActionProjection;
  readonly listWorkspaces?: () => Promise<WorkspaceList>;
  readonly getTaskList?: () => Promise<never>;
  readonly documents?: CloseSpecificationDialogProps['documents'];
}) {
  stubLayoutApis();
  const workflowExecutionApi: WorkflowExecutionApi = {
    start: vi.fn(never),
    finish: vi.fn(never),
    returnTo: vi.fn(never),
    abandon: vi.fn(never),
    closePreview,
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
  paths: ['specs/sso/overview.md', 'specs/sso/ux.md'],
  count: 2,
};

function dirtyPreview() {
  const dirty = refusal('CLOSE_PREFLIGHT', 422);
  (dirty.cause as { data: Record<string, unknown> }).data.repository = [uncommitted];

  return dirty;
}

const fact = (dialog: HTMLElement, term: string) =>
  within(dialog).getByText(term).nextElementSibling?.textContent;

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
    expect(within(dialog).getByText('specs/sso/ux.md')).toBeTruthy();
    // The checkout's path comes from the registered workspaces, not from the refusal.
    expect(
      await within(dialog).findByText('D:\\repos\\acme\\.nevo\\worktrees\\nevo-1'),
    ).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copy path' })).toBeTruthy();
    expect(within(dialog).getByText('Discarding deletes these changes for good.')).toBeTruthy();
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
        "Commit them in the specification's checkout, then check again.",
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
});
