// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../test-support/app/stubLayoutApis';
import { fakeTaskAuthoringApi } from '../authoring/authoring.test-support';
import type { WorkflowExecutionApi } from './api';
import { SPEC, dominik, withExits } from './projections.stories-support';
import { WorkflowNow } from './WorkflowNow';

afterEach(cleanup);

const never = () => new Promise<never>(() => undefined);

function renderNow(ui: ReactNode, start: WorkflowExecutionApi['start'] = vi.fn(never)) {
  stubLayoutApis();
  const services = createSpecFlowAppServices({
    taskAuthoringApi: fakeTaskAuthoringApi(),
    workflowExecutionApi: {
      start,
      finish: vi.fn(never),
      returnTo: vi.fn(never),
      abandon: vi.fn(never),
      closePreview: vi.fn(never),
      closeOccupancy: vi.fn(never),
      close: vi.fn(never),
    },
  });

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>{ui}</LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

const outline = (position: number, title: string) => ({
  stepCount: 7,
  current: { step: 'breakdown', title, position },
  next: { step: 'review', title: 'Review the breakdown', position: position + 1 },
});

/** Step 4 of 7, a step that produces Tasks, with Finish step available. */
function breakdown(attempt = 1): WorkflowActionProjection {
  return withExits({
    subject: { kind: 'specification', specId: SPEC },
    workflow: { workflowId: 'feature', title: 'Feature', version: 1, revision: 'rev-1' },
    position: {
      kind: 'active',
      step: {
        id: 'breakdown',
        title: 'Break the solution down',
        kind: 'work',
        purpose: '',
        produces: 'tasks',
      },
      attempt: { number: attempt, startedAt: new Date().toISOString(), actor: dominik },
    },
    actions: {
      finish: {
        step: 'breakdown',
        attempt,
        transitions: [
          {
            id: 'done',
            label: 'Done',
            target: { kind: 'step', step: 'review' },
            feedback: 'optional',
          },
        ],
      },
    },
    specification: { createTask: { kind: 'allowed' }, taskTypes: [] },
    outline: outline(4, 'Break the solution down'),
  });
}

function OverviewNow({
  projection,
  onNewTask,
}: {
  readonly projection: WorkflowActionProjection;
  readonly onNewTask?: () => void;
}) {
  return (
    <WorkflowNow
      subject={{ specId: SPEC }}
      projection={projection}
      headingId="now"
      links={{}}
      artifactOptions={[]}
      specification={{ specId: SPEC, ...(onNewTask ? { onNewTask } : {}) }}
    />
  );
}

describe('the Specification Now block', () => {
  it('is a card that becomes a flush band below a 40rem page (a container query)', () => {
    renderNow(<OverviewNow projection={breakdown()} />);

    const region = screen.getByRole('region', { name: 'Now' });
    expect(region.getAttribute('data-accent-bleed')).toBe('narrow');
    expect(region.className).toContain('@max-[40rem]/app-content:');
  });

  it('places the step on its track, named once, with no step id, revision or first attempt', () => {
    renderNow(<OverviewNow projection={breakdown()} />);

    const track = screen.getByRole('img', { name: 'Step 4 of 7: Break the solution down' });
    expect(track.getAttribute('data-progress-representation')).toBe('position');
    const label = screen.getByText('Step 4 of 7 · next: Review the breakdown');
    expect(label.getAttribute('aria-hidden')).toBe('true');

    const region = screen.getByRole('region', { name: 'Now' });
    expect(within(region).getByText(/^In progress since .+ · started by /)).toBeTruthy();
    expect(region.textContent).not.toMatch(/Attempt|rev 1/);
    // The step id is in the ⋯ note only.
    expect(within(region).queryByText(/^breakdown$/)).toBeNull();
    expect(region.querySelector('.font-mono')).toBeNull();
  });

  it('names the attempt from the second one on', () => {
    renderNow(<OverviewNow projection={breakdown(2)} />);

    expect(screen.getByText(/^Attempt 2 · in progress since /)).toBeTruthy();
  });

  it('offers New task beside Finish step at a step that produces Tasks, as the one secondary', () => {
    const onNewTask = vi.fn();
    renderNow(<OverviewNow projection={breakdown()} onNewTask={onNewTask} />);

    const actions = document.querySelector<HTMLElement>('[data-slot="workflow-actions"]')!;
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Finish step', 'New task']);
    fireEvent.click(within(actions).getByRole('button', { name: 'New task' }));
    expect(onNewTask).toHaveBeenCalledOnce();
  });

  it('makes New task the only action when Finish step is not available', () => {
    const projection = breakdown();
    const done = projection.actions.finish!.transitions[0]!;
    const onNewTask = vi.fn();
    renderNow(
      <OverviewNow
        projection={{
          ...projection,
          actions: {
            finish: {
              ...projection.actions.finish!,
              transitions: [
                {
                  ...done,
                  unavailable: 'tasks-open',
                  openTasks: [{ taskId: 't-02', cause: 'active' }],
                },
              ],
            },
          },
        }}
        onNewTask={onNewTask}
      />,
    );

    const actions = document.querySelector<HTMLElement>('[data-slot="workflow-actions"]')!;
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['New task']);
    fireEvent.click(within(actions).getByRole('button', { name: 'New task' }));
    expect(onNewTask).toHaveBeenCalledOnce();
  });

  it('keeps New task one tap away beside an unmet gate action and Finish step', () => {
    const projection = breakdown();
    const done = projection.actions.finish!.transitions[0]!;
    const gate = {
      id: 'breakdown-plan',
      type: 'document' as const,
      label: 'plan.md has a Tasks section',
      documentType: 'plan',
      scope: { kind: 'specification' as const, specId: SPEC },
      status: 'unsatisfied' as const,
      reason: 'sections-missing' as const,
      missingSections: ['Tasks'],
      documentId: 'plan',
    };
    renderNow(
      <WorkflowNow
        subject={{ specId: SPEC }}
        projection={{
          ...projection,
          actions: {
            finish: {
              ...projection.actions.finish!,
              transitions: [{ ...done, unavailable: 'gate-unsatisfied', gates: [gate] }],
            },
          },
        }}
        headingId="now"
        links={{}}
        artifactOptions={[]}
        gateAction={() => ({ label: 'Open plan.md', onSelect: vi.fn() })}
        specification={{ specId: SPEC, onNewTask: vi.fn() }}
      />,
    );

    const actions = document.querySelector<HTMLElement>('[data-slot="workflow-actions"]')!;
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Open plan.md', 'Finish step', 'New task']);
  });

  it('offers no New task when a Task may not be created', () => {
    const projection = breakdown();
    renderNow(
      <OverviewNow
        projection={{
          ...projection,
          specification: {
            ...projection.specification!,
            createTask: { kind: 'unavailable', reason: 'task-limit' },
          },
        }}
        onNewTask={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
  });

  it('shows the start as pending until the new position is read, never a stale "Ready to start"', async () => {
    const projection: WorkflowActionProjection = {
      ...breakdown(),
      position: {
        kind: 'ready',
        next: {
          step: {
            id: 'breakdown',
            title: 'Break the solution down',
            kind: 'work',
            purpose: '',
          },
        },
      },
      actions: { start: {} },
    } as WorkflowActionProjection;
    renderNow(<OverviewNow projection={projection} />);

    expect(screen.getByText('Ready to start')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Break the solution down' }));

    const pending = await screen.findByRole('button', { name: 'Starting…' });
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Ready to start')).toBeNull();
  });
});
