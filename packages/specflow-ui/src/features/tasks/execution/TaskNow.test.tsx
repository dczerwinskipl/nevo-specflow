// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../test-support/app/stubLayoutApis';
import { fakeTaskAuthoringApi } from '../authoring/authoring.test-support';
import {
  HOLD_REASON,
  SPEC,
  TASK,
  taskResourceFor,
  taskWorkflowProjection,
  type TaskWorkflowScenario,
} from './projections.stories-support';
import { TaskNow, type TaskNowProps } from './TaskNow';

afterEach(cleanup);

const never = () => new Promise<never>(() => undefined);

function renderTaskNow(
  scenario: TaskWorkflowScenario,
  props: Partial<Pick<TaskNowProps, 'primary' | 'onOpenDocument'>> = {},
) {
  stubLayoutApis();
  const services = createSpecFlowAppServices({
    taskAuthoringApi: fakeTaskAuthoringApi(),
    workflowExecutionApi: {
      start: vi.fn(never),
      finish: vi.fn(never),
      returnTo: vi.fn(never),
      reevaluateWait: vi.fn(never),
      abandon: vi.fn(never),
      checkAgentExecution: vi.fn(never),
      startAgentExecution: vi.fn(never),
      closePreview: vi.fn(never),
      closeOccupancy: vi.fn(never),
      close: vi.fn(never),
    },
  });
  const ui: ReactNode = (
    <TaskNow
      specId={SPEC}
      taskId={TASK}
      typeTitle="UI"
      resource={taskResourceFor(scenario)}
      projection={taskWorkflowProjection(scenario)}
      onOpenDocument={props.onOpenDocument ?? vi.fn()}
      {...(props.primary ? { primary: props.primary } : {})}
    />
  );

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>{ui}</LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

const now = () => screen.getByRole('region', { name: 'Now' });

describe('the Task Now block', () => {
  it('says only where the work goes when the step has no document gates (no empty "Done when")', () => {
    renderTaskNow('rework');

    expect(now().querySelector('[data-now-done-when]')).toBeNull();
    expect(within(now()).queryByText(/Done (with .+ )?when/)).toBeNull();
    expect(within(now()).queryByText(/needed to (finish|start)/i)).toBeNull();
    expect(within(now()).getByText('Then: Review')).toBeTruthy();
  });

  it('says what the step is for and what finishes it, with the fix of the unmet gate first', () => {
    const onOpenDocument = vi.fn();
    renderTaskNow('implement-gate', { onOpenDocument });

    expect(now().querySelector('[data-now-goal]')?.textContent).toBe(
      'GoalWrite the code and its tests so the behaviour in task.md works.',
    );
    // An open item, not a warning: the step is being worked on.
    const gates = within(now()).getByRole('list', { name: 'Done when' });
    expect(gates.textContent).toBe('task.md has a Verification section · not yet (not met)');
    expect(gates.querySelector('.text-status-attention')).toBeNull();
    expect(within(now()).getByText('Then: Review')).toBeTruthy();
    expect(
      within(now()).getByText('Add the Verification section to task.md to finish.'),
    ).toBeTruthy();

    const actions = now().querySelector<HTMLElement>('[data-slot="workflow-actions"]')!;
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Open task.md', 'Finish step']);
    fireEvent.click(within(actions).getByRole('button', { name: 'Open task.md' }));
    expect(onOpenDocument).toHaveBeenCalledWith('task');
  });

  it('keeps the step id, the workflow revision, a first attempt and Return out of the body', () => {
    renderTaskNow('implement-gate');

    const text = now().textContent ?? '';
    expect(text).toContain('In progress since');
    for (const token of ['implement', 'Standard Task', 'rev 1', 'Attempt 1', 'Return']) {
      expect(text).not.toContain(token);
    }

    fireEvent.keyDown(within(now()).getByRole('button', { name: 'Workflow operations' }), {
      key: 'Enter',
    });
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Return to Design' })).toBeTruthy();
    expect(menu.textContent).toContain('Step implement · Standard Task rev 1');
  });

  it('shows a hand-off that is a labelled paragraph in the Narrow band and a quote in the card', () => {
    renderTaskNow('rework');

    const handoff = now().querySelector<HTMLElement>('[data-now-handoff]')!;
    expect(handoff.className).toContain('@min-[40rem]/app-content:border-l-2');
    expect(handoff.className).not.toMatch(/(^|\s)border-l-2/);
    expect(within(handoff).getByText('Last hand-off').className).toContain(
      '@min-[40rem]/app-content:hidden',
    );
    // Under the label the step is not prefixed with "Last:" again; in the card it is.
    expect(within(handoff).getByText('Last: Review ·', { exact: false }).className).toBe(
      'hidden @min-[40rem]/app-content:inline',
    );
    expect(within(handoff).getByText('Review ·', { exact: true }).className).toBe(
      '@min-[40rem]/app-content:hidden',
    );
    // A second attempt is named; the only result leads to Review.
    expect(now().textContent).toContain('Attempt 2 · in progress since');
    expect(within(now()).getByText('Then: Review')).toBeTruthy();
  });

  it('says what finishes a step an agent runs, per result, with Restart for the step itself', () => {
    renderTaskNow('review-agent');

    // No Finish step for the viewer, yet the step's results are read: only Approved needs a gate.
    expect(within(now()).queryByRole('button', { name: 'Finish step' })).toBeNull();
    expect(within(now()).getByRole('list', { name: 'Done with Approved when' }).textContent).toBe(
      'task.md has a Review notes section · not yet (not met) Open task.md',
    );
    // The results part ways (done or back to Implementation): no "Then".
    expect(now().textContent).not.toContain('Then:');

    fireEvent.keyDown(within(now()).getByRole('button', { name: 'Workflow operations' }), {
      key: 'Enter',
    });
    expect(
      within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Restart Review' }),
    ).toBeTruthy();
  });

  it('on hold leads with the hold and its reason, the position secondary, Resume the one action', () => {
    const onPress = vi.fn();
    renderTaskNow('on-hold', { primary: { label: 'Resume', busy: false, onPress } });

    const lines = [...now().querySelectorAll('[aria-live="polite"] > p')].map(
      (line) => line.textContent,
    );
    expect(lines).toEqual(['On hold', HOLD_REASON, 'Not started · First step · Design']);
    expect(now().querySelector('[data-now-goal]')?.textContent).toBe('GoalDesign of the change.');
    const actions = now().querySelector<HTMLElement>('[data-slot="workflow-actions"]')!;
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Resume']);
  });
});
