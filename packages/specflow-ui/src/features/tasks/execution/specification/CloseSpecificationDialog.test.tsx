// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloseMerge, RepositoryBlocker } from '@nevo/specflow-contracts/specs';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../../test-support/app/stubLayoutApis';
import { refusal } from '../../authoring/authoring.test-support';
import type { WorkflowExecutionApi } from '../api';
import { SPEC, specificationWorkflowProjection } from '../projections.stories-support';
import type { BlockerTask } from './BlockerGroups';
import { CloseSpecificationDialog } from './CloseSpecificationDialog';

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

function renderDialog(
  closePreview: WorkflowExecutionApi['closePreview'],
  close: WorkflowExecutionApi['close'] = vi.fn(never),
  tasks: ReadonlyMap<string, BlockerTask> = new Map([done('t-1'), done('t-2')]),
) {
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

  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={createSpecFlowAppServices({ workflowExecutionApi })}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <CloseSpecificationDialog
            open
            onOpenChange={vi.fn()}
            specId={SPEC}
            specTitle="SSO sign-in"
            projection={specificationWorkflowProjection('completed')}
            tasks={tasks}
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
  checkoutPath: 'D:\\repos\\acme\\.nevo\\worktrees\\nevo-1',
  paths: ['specs/sso/overview.md', 'specs/sso/ux.md'],
  count: 2,
};

const fact = (dialog: HTMLElement, term: string) =>
  within(dialog).getByText(term).nextElementSibling?.textContent;

describe('CloseSpecificationDialog', () => {
  it('names uncommitted files and the discard warning before any press, then checks again to ready', async () => {
    const dirty = refusal('CLOSE_PREFLIGHT', 422);
    (dirty.cause as { data: Record<string, unknown> }).data.repository = [uncommitted];
    const closePreview = vi
      .fn<WorkflowExecutionApi['closePreview']>()
      .mockRejectedValueOnce(dirty)
      .mockResolvedValue(planned());
    const dialog = renderDialog(closePreview);

    expect(
      await within(dialog).findByText('SSO sign-in cannot close yet: 1 repository problem.'),
    ).toBeTruthy();
    expect(within(dialog).getByText('specs/sso/ux.md')).toBeTruthy();
    expect(within(dialog).getByText('D:\\repos\\acme\\.nevo\\worktrees\\nevo-1')).toBeTruthy();
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

  it('replaces ready with a refused Close, and checks again from there', async () => {
    const closePreview = vi.fn(() => Promise.resolve(planned()));
    const close = vi.fn(() => Promise.reject(refusal('CLOSE_CONFLICT', 409)));
    const dialog = renderDialog(closePreview, close);

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
      const dialog = renderDialog(vi.fn(() => Promise.resolve(planned(merge))));
      await within(dialog).findByText('Ready to close');
      const text = fact(dialog, 'Merges');
      cleanup();

      return text;
    };

    expect(await merges({ ...integrates, commitsAhead: 0 })).toBe('Nothing to merge');
    expect(
      await merges({
        status: 'not-integrated',
        reason: 'primary-checkout',
        sourceBranch: 'develop',
      }),
    ).toBe('Archives on develop (main folder; nothing to merge)');
    expect(await merges({ status: 'not-integrated', reason: 'git-off', checkout: 'primary' })).toBe(
      'Archives without Git (Git is off for this project)',
    );
  });

  it('shows the running Close busy, with Cancel off', async () => {
    const dialog = renderDialog(vi.fn(() => Promise.resolve(planned())));

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Close and archive' }));

    const busy = await within(dialog).findByRole<HTMLButtonElement>('button', { name: 'Closing…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(
      true,
    );
  });

  it('counts the Tasks not delivered beside the done ones', async () => {
    const dialog = renderDialog(
      vi.fn(() => Promise.resolve(planned())),
      vi.fn(never),
      new Map([
        done('t-1'),
        ['t-2', { id: 't-2', title: 'Two', state: 'Cancelled', statusId: 'cancelled' }],
      ]),
    );
    await within(dialog).findByText('Ready to close');

    expect(fact(dialog, 'Tasks')).toBe('1 done · 1 cancelled, not delivered');
    expect(within(dialog).getByRole('region', { name: 'Cancelled, not delivered' })).toBeTruthy();
  });
});
