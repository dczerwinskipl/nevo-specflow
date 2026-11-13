// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../test-support/app/stubLayoutApis';
import { fakeTaskAuthoringApi, refusal } from '../authoring/authoring.test-support';
import { useTaskActions } from '../authoring/useTaskAuthoring';
import type { WorkflowExecutionApi } from './api';
import {
  SPEC,
  TASK,
  specificationWorkflowProjection,
  taskWorkflowProjection,
} from './projections.stories-support';
import { AbandonSpecificationDialog } from './specification/AbandonSpecificationDialog';
import { CloseSpecificationDialog } from './specification/CloseSpecificationDialog';
import { WorkflowNow } from './WorkflowNow';

afterEach(cleanup);

const never = () => new Promise<never>(() => undefined);

function fakeExecutionApi(overrides: Partial<WorkflowExecutionApi> = {}) {
  return {
    start: vi.fn(never),
    finish: vi.fn(never),
    returnTo: vi.fn(never),
    abandon: vi.fn(never),
    closePreview: vi.fn(never),
    close: vi.fn(never),
    ...overrides,
  } satisfies WorkflowExecutionApi;
}

function renderWith(
  ui: ReactNode,
  options: {
    readonly execution?: WorkflowExecutionApi;
    readonly taskActions?: () => Promise<WorkflowActionProjection>;
  } = {},
) {
  stubLayoutApis();
  const services = createSpecFlowAppServices({
    taskAuthoringApi: fakeTaskAuthoringApi(
      options.taskActions ? { taskActions: vi.fn(options.taskActions) } : {},
    ),
    workflowExecutionApi: options.execution ?? fakeExecutionApi(),
  });

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>{ui}</LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

/** The Task's Now block over its projection query (a command refreshes it). */
function TaskNowHarness() {
  const projection = useTaskActions(SPEC, TASK).data;

  return projection ? (
    <WorkflowNow
      subject={{ specId: SPEC, taskId: TASK }}
      projection={projection}
      headingId="now"
      links={{}}
      firstStart={{ taskId: TASK, typeTitle: 'UI' }}
      artifactOptions={[]}
    />
  ) : null;
}

const finishButton = () =>
  within(screen.getByRole('dialog')).getByRole<HTMLButtonElement>('button', {
    name: 'Finish step',
  });

describe('manual workflow execution', () => {
  it('finishes with a result that demands feedback only once feedback is given', async () => {
    const finish = vi.fn(() => never());
    renderWith(<TaskNowHarness />, {
      execution: fakeExecutionApi({ finish }),
      taskActions: () => Promise.resolve(taskWorkflowProjection('review')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /Changes requested/ }));

    expect(screen.getByRole('alert').textContent).toBe(
      'This result needs feedback for the next step.',
    );
    expect(finishButton().disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep the return URL.' } });
    fireEvent.click(finishButton());

    await waitFor(() =>
      expect(finish).toHaveBeenCalledWith(
        { specId: SPEC, taskId: TASK },
        {
          step: 'review',
          attempt: 1,
          result: 'changes-requested',
          feedback: 'Keep the return URL.',
        },
      ),
    );
    // A finish in progress cannot be sent twice.
    const pending = within(screen.getByRole('dialog')).getByRole<HTMLButtonElement>('button', {
      name: 'Finishing…',
    });
    expect(pending.disabled).toBe(true);
    fireEvent.click(pending);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('keeps Finish disabled for a result whose exit gate is unmet; other results stay available', async () => {
    renderWith(<TaskNowHarness />, {
      taskActions: () => Promise.resolve(taskWorkflowProjection('spike-gate')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Done/ }));

    expect(screen.getByRole('list', { name: 'Needed to finish with Done' }).textContent).toContain(
      'A findings document · none registered yet',
    );
    expect(finishButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Not worth pursuing/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Too slow.' } });
    expect(finishButton().disabled).toBe(false);
  });

  it('re-opens the first start on the new revision when the workflow changed meanwhile', async () => {
    let version = 4;
    const start = vi.fn(() => {
      version = 5;

      return Promise.reject(refusal('WORKFLOW_DEFINITION_CHANGED'));
    });
    renderWith(<TaskNowHarness />, {
      execution: fakeExecutionApi({ start }),
      taskActions: () => Promise.resolve(taskWorkflowProjection('first-start', { version })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Start Design' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Design' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toContain(
        'You confirmed rev 4, but Build and review is now rev 5.',
      ),
    );
    expect(start).toHaveBeenCalledWith(
      { specId: SPEC, taskId: TASK },
      { expectedWorkflowRevision: 'rev-build-4' },
    );
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Start with rev 5' }));
    await waitFor(() =>
      expect(start).toHaveBeenLastCalledWith(
        { specId: SPEC, taskId: TASK },
        { expectedWorkflowRevision: 'rev-build-5' },
      ),
    );
  });

  it('shows what blocks a Close, grouped in order, with only Dismiss', () => {
    renderWith(
      <CloseSpecificationDialog
        open
        onOpenChange={vi.fn()}
        specId={SPEC}
        specTitle="Single sign-on"
        projection={specificationWorkflowProjection('close-blocked')}
        tasks={new Map([['t-02', { id: 't-02', title: 'Token exchange', state: 'In progress' }]])}
        cancelledTasks={[]}
        onAbandonInstead={vi.fn()}
        onSeeWorkflow={vi.fn()}
        onSeeTasks={vi.fn()}
        onOpenTask={vi.fn()}
        onClosed={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');

    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Workflow · 1', 'Unfinished tasks · 1', 'Pending writes · 1']);
    expect(within(dialog).getByRole('button', { name: 'Abandon instead' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Close specification' })).toBeNull();
    expect(within(dialog).getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1);
  });

  it('abandons only with a reason', async () => {
    const abandon = vi.fn(() => never());
    renderWith(
      <AbandonSpecificationDialog
        open
        onOpenChange={vi.fn()}
        specId={SPEC}
        specTitle="Single sign-on"
        projection={specificationWorkflowProjection('waiting')}
        tasks={new Map()}
        unfinishedTasks={[{ id: 't-02', title: 'Token exchange', state: 'In progress' }]}
        activeTasks={[]}
        onOpenTask={vi.fn()}
      />,
      { execution: fakeExecutionApi({ abandon }) },
    );
    const submit = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Abandon specification',
    });

    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Contract cancelled. ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(abandon).toHaveBeenCalledWith(SPEC, 'Contract cancelled.'));
  });
});
