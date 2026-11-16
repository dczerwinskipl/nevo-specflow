// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
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
  dominik,
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
    closeOccupancy: vi.fn(() => Promise.resolve({ blockers: [] })),
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
    // Disabled Finish says why, next to it.
    expect(finishButton().disabled).toBe(true);
    expect(finishButton().getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(finishButton().getAttribute('aria-describedby')!)?.textContent,
    ).toBe('Choose a result to finish.');
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
    expect(
      within(screen.getByRole('dialog')).getByText(
        'Not everything needed for this result is done yet.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Not worth pursuing/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Too slow.' } });
    expect(finishButton().disabled).toBe(false);
  });

  it('chooses the only result already and names a result without a label by its readable id', async () => {
    const review = taskWorkflowProjection('review');
    const only = { ...review.actions.finish!.transitions[0]!, id: 'ready-for-merge' };
    delete (only as { label?: string }).label;
    delete (only as { result?: string }).result;
    renderWith(<TaskNowHarness />, {
      taskActions: () =>
        Promise.resolve({
          ...review,
          actions: {
            ...review.actions,
            finish: { ...review.actions.finish!, transitions: [only] },
          },
        }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));

    const radio = screen.getByRole<HTMLInputElement>('radio', { name: /Ready for merge/ });
    expect(radio.getAttribute('aria-checked') ?? String(radio.checked)).toBe('true');
    expect(finishButton().disabled).toBe(only.feedback === 'required');
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

  it('lists the agent Turns running in the worktree beside the workflow blockers, without planning the Close', async () => {
    const execution = fakeExecutionApi({
      closeOccupancy: vi.fn(() =>
        Promise.resolve({
          blockers: [
            {
              kind: 'session-turn-running' as const,
              subjectIds: ['session-1'],
              message: 'display only',
            },
          ],
        }),
      ),
    });
    renderWith(
      <CloseSpecificationDialog
        open
        onOpenChange={vi.fn()}
        specId={SPEC}
        specTitle="Single sign-on"
        projection={specificationWorkflowProjection('close-blocked')}
        tasks={new Map([['t-02', { id: 't-02', title: 'Token exchange', state: 'In progress' }]])}
        cancelledTasks={[]}
        onSeeWorkflow={vi.fn()}
        onSeeTasks={vi.fn()}
        onOpenTask={vi.fn()}
        onClosed={vi.fn()}
      />,
      { execution },
    );
    const dialog = screen.getByRole('dialog');

    await waitFor(() =>
      expect(
        within(dialog)
          .getAllByRole('heading', { level: 3 })
          .map((heading) => heading.textContent),
      ).toEqual([
        'Running sessions · 1',
        'Workflow · 1',
        'Unfinished tasks · 1',
        'Pending writes · 1',
      ]),
    );
    expect(execution.closeOccupancy).toHaveBeenCalledWith(SPEC, expect.anything());
    expect(execution.closePreview).not.toHaveBeenCalled();
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

  it('reports what the finish commit left uncommitted, and only until the next attempt is active (B4)', async () => {
    const finish = vi.fn(() =>
      Promise.resolve({
        subject: { kind: 'task' as const, specId: SPEC, taskId: TASK },
        transition: 'approved',
        position: { state: 'ready' as const, step: 'review' },
        continuation: { kind: 'none' as const, reason: 'on-hold' as const },
        createdTasks: [],
        postActions: [
          {
            action: 'commit-execution-state' as const,
            status: 'completed' as const,
            commit: { paths: ['specs/active/s/.execution/specification.yaml'] },
            held: {
              edited: ['specs/active/s/tasks/a/task.md'],
              paths: ['specs/active/s/tasks/a/task.md', 'specs/active/s/tasks/index.yaml'],
            },
          },
        ],
      }),
    );
    let show: (projection: WorkflowActionProjection) => void = () => undefined;
    function Switching() {
      const [projection, setProjection] = useState(taskWorkflowProjection('review'));
      useEffect(() => {
        show = setProjection;
      }, []);

      return (
        <WorkflowNow
          subject={{ specId: SPEC, taskId: TASK }}
          projection={projection}
          headingId="now"
          links={{}}
          artifactOptions={[]}
        />
      );
    }

    renderWith(<Switching />, { execution: fakeExecutionApi({ finish }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Approved/ }));
    fireEvent.click(finishButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The finished attempt has no Finish any more: the commit's own result is shown beside it.
    const finished = taskWorkflowProjection('review');
    act(() => show({ ...finished, actions: {} }));
    const held =
      'The step is finished. Some workflow files stay uncommitted because ' +
      'specs/active/s/tasks/a/task.md changed outside SpecFlow after SpecFlow wrote it. ' +
      'Commit them with Git; otherwise Close includes them.';
    expect(screen.getByText(held)).toBeTruthy();

    // The next attempt is active: the earlier commit's note does not carry over into it.
    act(() => show(taskWorkflowProjection('rework')));
    expect(screen.queryByText(held)).toBeNull();
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
      // The projection is not on a wait step: no "waiting for tasks".
      'Single sign-on cannot close yet: its workflow has not ended, 1 task is unfinished, and 1 task document is still being saved.',
    );
    expect(screen.getByRole('heading', { name: 'Pending writes · 1' })).toBeTruthy();
  });

  it('says what to do when Close stops at a modified worktree local configuration', async () => {
    const close = vi.fn(() => Promise.reject(refusal('CLOSE_LOCAL_CONFIG_MODIFIED', 409)));
    renderWith(
      <CloseSpecificationDialog
        open
        onOpenChange={vi.fn()}
        specId={SPEC}
        specTitle="Single sign-on"
        projection={specificationWorkflowProjection('abandoned')}
        tasks={new Map()}
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

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Move or delete it, then close again.',
    );
  });
  it('names the open Tasks that keep the Specification from completing, in Now and in Finish', () => {
    renderWith(
      <WorkflowNow
        subject={{ specId: SPEC }}
        projection={specificationWorkflowProjection('tasks-open')}
        headingId="now"
        links={{ tasks: vi.fn() }}
        artifactOptions={[]}
      />,
    );
    const open = `t-02 is in progress, ${TASK} waits for other tasks`;

    expect(document.querySelector('[data-now-tasks-open]')?.textContent).toBe(
      `To finish with Accepted, every task must be done or cancelled. Open: ${open}. See Tasks`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Accepted/ }));

    expect(
      within(screen.getByRole('dialog')).getByText(
        `This result completes the specification, so every task must be done or cancelled first. Open: ${open}.`,
      ),
    ).toBeTruthy();
    expect(finishButton().disabled).toBe(true);
  });

  it('keeps Finish step off the Overview main actions while every result waits for open Tasks', () => {
    renderWith(
      <WorkflowNow
        subject={{ specId: SPEC }}
        projection={specificationWorkflowProjection('tasks-open')}
        headingId="now"
        links={{ tasks: vi.fn() }}
        artifactOptions={[]}
        overview={{ specId: SPEC }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Finish step' })).toBeNull();
    expect(screen.getByRole('button', { name: 'See Tasks' })).toBeTruthy();
  });

  it('offers an unmet gate as the Overview main action only when meeting it would make a result available', () => {
    const base = specificationWorkflowProjection('tasks-open');
    const accepted = base.actions.finish!.transitions[0]!;
    const noteGate = {
      id: 'note',
      type: 'document' as const,
      label: 'A note',
      documentType: 'note',
      scope: { kind: 'specification' as const, specId: SPEC },
      status: 'unsatisfied' as const,
      reason: 'no-document' as const,
    };
    const withTransitions = (
      transitions: NonNullable<WorkflowActionProjection['actions']['finish']>['transitions'],
    ): WorkflowActionProjection => ({
      ...base,
      actions: { ...base.actions, finish: { ...base.actions.finish!, transitions } },
    });
    const gated = { ...accepted, gates: [noteGate] };
    const render = (projection: WorkflowActionProjection) =>
      renderWith(
        <WorkflowNow
          subject={{ specId: SPEC }}
          projection={projection}
          headingId="now"
          links={{ tasks: vi.fn() }}
          artifactOptions={[]}
          gateAction={() => ({ label: 'Create note', onSelect: vi.fn() })}
          overview={{ specId: SPEC }}
        />,
      );

    // The only result waits for open Tasks: its gate would not help.
    const first = render(withTransitions([gated]));
    expect(screen.queryByRole('button', { name: 'Finish step' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create note' })).toBeNull();
    first.unmount();

    // Another result only needs the gate: meeting it makes that result available.
    render(
      withTransitions([
        gated,
        {
          id: 'rejected',
          label: 'Rejected',
          target: { kind: 'step', step: 'breakdown' },
          feedback: 'required',
          unavailable: 'gate-unsatisfied',
          gates: [noteGate],
        },
      ]),
    );
    expect(screen.queryByRole('button', { name: 'Finish step' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Create note' })).toBeTruthy();
  });

  it('lets a breakdown complete once its own open drafts are unticked (resolvableByFinish)', async () => {
    const finish = vi.fn(() => never());
    const base = specificationWorkflowProjection('tasks-open');
    const projection: WorkflowActionProjection = {
      ...base,
      position: {
        kind: 'active',
        step: { id: 'breakdown', title: 'Breakdown', kind: 'work', purpose: '', produces: 'tasks' },
        attempt: { number: 2, startedAt: '2026-11-14T09:30:00Z', actor: dominik },
      },
      actions: {
        finish: {
          step: 'breakdown',
          attempt: 2,
          transitions: [
            {
              id: 'nothing-to-do',
              result: 'empty',
              label: 'Nothing to do',
              target: { kind: 'terminal', outcome: 'completed' },
              feedback: 'optional',
              unavailable: 'tasks-open',
              openTasks: [{ taskId: 't-08', cause: 'draft' }],
              resolvableByFinish: true,
              closableTasks: [{ taskId: 't-08', by: 'left-out' }],
            },
          ],
          drafts: [{ id: 't-08', title: 'Audit log', type: 'backend' }],
        },
      },
    };
    renderWith(
      <WorkflowNow
        subject={{ specId: SPEC }}
        projection={projection}
        headingId="now"
        links={{ tasks: vi.fn() }}
        artifactOptions={[]}
        overview={{ specId: SPEC }}
      />,
      { execution: fakeExecutionApi({ finish }) },
    );

    expect(document.querySelector('[data-now-tasks-open]')?.textContent).toContain(
      'To finish with Nothing to do, leave out the open drafts of this step: untick t-08 when you finish.',
    );
    // The Overview offers Finish step: the dialog itself can close the open Task.
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Nothing to do/ }));
    expect(document.querySelector('[data-finish-tasks-open]')?.textContent).toBe(
      'This result completes the specification, so every task must be done or cancelled. Still open: t-08 is a draft. Untick t-08 below to cancel them with this finish.',
    );
    expect(finishButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 't-08 · Audit log' }));
    expect(document.querySelector('[data-finish-tasks-open]')?.textContent).toBe(
      'Finishing cancels the drafts you unticked, so no task stays open and the specification completes.',
    );
    fireEvent.click(finishButton());

    await waitFor(() =>
      expect(finish).toHaveBeenCalledWith(
        { specId: SPEC },
        expect.objectContaining({ step: 'breakdown', attempt: 2, result: 'empty', tasks: [] }),
      ),
    );
  });

  it('names the Tasks a finish can only close by a decision, and keeps Finish off until they are cancelled', () => {
    const base = specificationWorkflowProjection('tasks-open');
    const accepted = base.actions.finish!.transitions[0]!;
    renderWith(
      <WorkflowNow
        subject={{ specId: SPEC }}
        projection={{
          ...base,
          actions: {
            ...base.actions,
            finish: {
              ...base.actions.finish!,
              transitions: [
                {
                  ...accepted,
                  // Approved Tasks no attempt runs on: a decision of the finish may cancel them.
                  openTasks: [
                    { taskId: 't-02', cause: 'ready' },
                    { taskId: TASK, cause: 'waiting' },
                  ],
                  resolvableByFinish: true,
                  closableTasks: [
                    { taskId: 't-02', by: 'decision' },
                    { taskId: TASK, by: 'decision' },
                  ],
                },
              ],
            },
          },
        }}
        headingId="now"
        links={{ tasks: vi.fn() }}
        artifactOptions={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Accepted/ }));

    expect(document.querySelector('[data-finish-tasks-open]')?.textContent).toBe(
      `This result completes the specification, so every task must be done or cancelled. Still open: t-02 can start or continue, ${TASK} waits for other tasks. Cancel t-02, ${TASK} in Tasks first.`,
    );
    expect(finishButton().disabled).toBe(true);
  });

  it('explains a finish the Engine refused because Tasks are open', async () => {
    const finish = vi.fn(() =>
      Promise.reject(
        refusal('WORKFLOW_TASKS_OPEN', 409, {
          openTasks: [{ taskId: 't-02', cause: 'broken' }],
        }),
      ),
    );
    const projection = specificationWorkflowProjection('tasks-open');
    const {
      unavailable: _unavailable,
      openTasks: _open,
      ...transition
    } = projection.actions.finish!.transitions[0]!;
    renderWith(
      <WorkflowNow
        subject={{ specId: SPEC }}
        projection={{
          ...projection,
          actions: {
            ...projection.actions,
            finish: {
              ...projection.actions.finish!,
              // The projection was read before the Task broke.
              transitions: [transition],
            },
          },
        }}
        headingId="now"
        links={{}}
        artifactOptions={[]}
      />,
      { execution: fakeExecutionApi({ finish }) },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    fireEvent.click(screen.getByRole('radio', { name: /^Accepted/ }));
    fireEvent.click(finishButton());

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The specification cannot complete while tasks are open: t-02 is broken. Finish or cancel them first.',
    );
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

  it('never hands the focus of a lost finish to the next step’s Start on the Overview', async () => {
    let finished = false;
    const finish = vi.fn(() => {
      finished = true;

      return Promise.reject(
        new ApiError({
          kind: 'timeout',
          operation: 'workflow',
          outcome: 'unknown',
          retryable: false,
        }),
      );
    });
    const review = taskWorkflowProjection('review');
    const ready: WorkflowActionProjection = {
      ...review,
      position: {
        kind: 'ready',
        next: { step: { id: 'rework', title: 'Rework', kind: 'work', purpose: '' }, human: true },
      } as unknown as WorkflowActionProjection['position'],
      actions: { start: { step: 'rework', firstStart: false } },
    };
    function OverviewHarness() {
      const projection = useTaskActions(SPEC, TASK).data;

      return projection ? (
        <WorkflowNow
          subject={{ specId: SPEC, taskId: TASK }}
          projection={projection}
          headingId="now"
          links={{}}
          artifactOptions={[]}
          overview={{ specId: SPEC }}
        />
      ) : null;
    }

    const execution = fakeExecutionApi({ finish });
    renderWith(<OverviewHarness />, {
      execution,
      taskActions: () => Promise.resolve(finished ? ready : review),
    });
    const open = await screen.findByRole('button', { name: 'Finish step' });
    open.focus();
    fireEvent.click(open);
    fireEvent.click(screen.getByRole('radio', { name: /^Approved/ }));
    fireEvent.click(finishButton());

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const start = await screen.findByRole('button', { name: 'Start Rework' });
    // The button that opened Finish is not the one that now starts the next step: a key press
    // meant for the Finish (Enter, Space) cannot start a step the owner never chose.
    expect(start).not.toBe(open);
    expect(document.activeElement).not.toBe(start);
    expect(execution.start).not.toHaveBeenCalled();
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
