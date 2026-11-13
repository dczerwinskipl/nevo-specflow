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
import { ApiError } from '../../../api';
import { fakeTaskAuthoringApi, refusal } from '../authoring/authoring.test-support';
import { useTaskActions } from '../authoring/useTaskAuthoring';
import type { WorkflowExecutionApi } from './api';
import {
  SPEC,
  TASK,
  closeBlockers,
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

/** A review that produces Tasks and owns two earlier drafts (t-09 depends on t-08). */
function producingProjection(): WorkflowActionProjection {
  const review = taskWorkflowProjection('review');

  return {
    ...review,
    position:
      review.position.kind === 'active'
        ? { ...review.position, step: { ...review.position.step, produces: 'tasks' } }
        : review.position,
    actions: {
      finish: {
        ...review.actions.finish!,
        drafts: [
          { id: 't-08', title: 'Audit log', type: 'backend' },
          { id: 't-09', title: 'Sign-out', type: 'ui', dependsOn: ['t-08'] },
        ],
      },
    },
  };
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
  it('closes the Finish dialog when a lost finish turns out recorded, instead of offering a retry', async () => {
    let finished = false;
    const finish = vi.fn(() => {
      finished = true;

      return Promise.reject(
        new ApiError({
          kind: 'network',
          operation: 'workflow',
          outcome: 'unknown',
          retryable: false,
        }),
      );
    });
    renderWith(<TaskNowHarness />, {
      execution: fakeExecutionApi({ finish }),
      taskActions: () => Promise.resolve(taskWorkflowProjection(finished ? 'rework' : 'review')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Approved/ }));
    fireEvent.click(finishButton());

    // The refreshed projection is the next attempt: the dialog of the finished one is gone.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toBe(
      'This step was already finished. What you can do now is shown below.',
    );
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('keeps the drafts a producing step made earlier unless the owner unticks them', async () => {
    const finish = vi.fn(() => never());
    const producing = producingProjection();
    renderWith(<TaskNowHarness />, {
      execution: fakeExecutionApi({ finish }),
      taskActions: () => Promise.resolve(producing),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Approved/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 't-08 · Audit log' }));
    fireEvent.click(finishButton());

    await waitFor(() =>
      expect(finish).toHaveBeenCalledWith(
        { specId: SPEC, taskId: TASK },
        {
          step: 'review',
          attempt: 1,
          result: 'approved',
          tasks: [{ id: 't-09', title: 'Sign-out', type: 'ui', dependsOn: ['t-08'] }],
        },
      ),
    );
  });

  it('shows what still holds the Specification when the Close itself is refused', async () => {
    // `CLOSE_BLOCKED` carries its blockers at the top of the body (not in `details`).
    const blocked = refusal('CLOSE_BLOCKED', 409);
    (blocked.cause as { data: Record<string, unknown> }).data.blockers = closeBlockers;
    const close = vi.fn(() => Promise.reject(blocked));
    renderWith(
      <CloseSpecificationDialog
        open
        onOpenChange={vi.fn()}
        specId={SPEC}
        specTitle="Single sign-on"
        projection={specificationWorkflowProjection('abandoned')}
        tasks={new Map([['t-02', { id: 't-02', title: 'Token exchange', state: 'Draft' }]])}
        cancelledTasks={[]}
        onSeeWorkflow={vi.fn()}
        onSeeTasks={vi.fn()}
        onOpenTask={vi.fn()}
        onClosed={vi.fn()}
      />,
      {
        execution: fakeExecutionApi({
          closePreview: vi.fn(() => Promise.resolve({ operationId: 'op-1' })),
          close,
        }),
      },
    );
    const submit = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Close specification',
    });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(close).toHaveBeenCalledWith(SPEC, 'op-1'));
    expect((await screen.findByText(/cannot close yet/)).textContent).toBe(
      'Single sign-on cannot close yet: its workflow is waiting for 1 unfinished task and 1 task document is still being saved.',
    );
    expect(screen.getByRole('heading', { name: 'Pending writes · 1' })).toBeTruthy();
  });
  it('names the kept draft that still needs an unticked one when the Engine refuses the finish', async () => {
    const finish = vi.fn(() =>
      Promise.reject(
        refusal('WORKFLOW_INPUT_INVALID', 422, {
          draftConflicts: [{ kept: 't-09', dependsOnCancelled: 't-08' }],
        }),
      ),
    );
    renderWith(<TaskNowHarness />, {
      execution: fakeExecutionApi({ finish }),
      taskActions: () => Promise.resolve(producingProjection()),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Approved/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 't-08 · Audit log' }));
    fireEvent.click(finishButton());

    expect((await screen.findByRole('alert')).textContent).toContain(
      'A draft you keep depends on a draft you unticked. Keep both, or untick both.',
    );
    expect(
      screen.getByText('t-09 still depends on t-08: keep t-08, or untick t-09 too.'),
    ).toBeTruthy();
  });

  it('closes after its own finish without saying the step was already finished', async () => {
    let finished = false;
    const finish = vi.fn(() => {
      finished = true;

      return Promise.resolve({
        subject: { kind: 'task' as const, specId: SPEC, taskId: TASK },
        transition: 'approved',
        position: { state: 'terminal' as const, outcome: 'completed' as const },
        continuation: { kind: 'none' as const, reason: 'terminal' as const },
        createdTasks: [],
      });
    });
    renderWith(<TaskNowHarness />, {
      execution: fakeExecutionApi({ finish }),
      taskActions: () => Promise.resolve(taskWorkflowProjection(finished ? 'rework' : 'review')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Approved/ }));
    fireEvent.click(finishButton());

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/already finished/)).toBeNull();
  });
});
