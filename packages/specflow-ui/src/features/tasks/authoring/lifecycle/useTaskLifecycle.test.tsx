// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import {
  SPEC,
  TASK,
  fakeTaskAuthoringApi,
  renderWithAuthoring,
  taskProjection,
} from '../authoring.test-support';
import type { TaskAuthoringApi } from '../api';
import { useTaskLifecycle } from './useTaskLifecycle';

afterEach(cleanup);

function Harness({
  lifecycle,
  missingContext,
}: {
  lifecycle: WorkflowActionProjection['task'];
  missingContext: readonly string[];
}) {
  const { actions, dialogs } = useTaskLifecycle({
    specId: SPEC,
    taskId: TASK,
    revision: 'rev-1',
    lifecycle,
    missingContext,
    onEditDetails: vi.fn(),
    onRemoved: vi.fn(),
  });

  return (
    <>
      {actions.map((action) => (
        <button key={action.id} type="button" disabled={action.disabled} onClick={action.onPress}>
          {action.label}
        </button>
      ))}
      {dialogs}
    </>
  );
}

function renderLifecycle(
  api: TaskAuthoringApi,
  lifecycle: WorkflowActionProjection['task'],
  missingContext: readonly string[] = [],
) {
  renderWithAuthoring(<Harness lifecycle={lifecycle} missingContext={missingContext} />, api);
}

const buttons = () => screen.getAllByRole('button').map((button) => button.textContent);

describe('useTaskLifecycle', () => {
  it('offers only the actions the projection allows', () => {
    renderLifecycle(fakeTaskAuthoringApi(), taskProjection().task);

    expect(buttons()).toEqual([
      'Approve',
      'Edit details',
      'Put on hold',
      'Cancel task',
      'Remove task',
    ]);
  });

  it('keeps Put on hold visible but disabled during an active attempt', () => {
    const no = (reason: 'active-attempt' | 'started' | 'status') =>
      ({ kind: 'unavailable', reason }) as const;
    renderLifecycle(
      fakeTaskAuthoringApi(),
      taskProjection([], {
        approve: no('status'),
        hold: no('active-attempt'),
        remove: no('started'),
        editDependencies: no('started'),
      }).task,
    );

    expect(buttons()).toEqual(['Edit details', 'Put on hold', 'Cancel task']);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Put on hold' }).disabled).toBe(
      true,
    );
  });

  it('approves directly when no required context entry is missing', async () => {
    const setStatus = vi.fn(() => Promise.resolve({ taskId: TASK, status: 'ready' as const }));
    renderLifecycle(fakeTaskAuthoringApi({ setStatus }), taskProjection().task);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(SPEC, TASK, { status: 'ready' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirms Approve first, naming the missing required context', async () => {
    const setStatus = vi.fn(() => Promise.resolve({ taskId: TASK, status: 'ready' as const }));
    renderLifecycle(fakeTaskAuthoringApi({ setStatus }), taskProjection().task, ['Old login flow']);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('1 required context entry is missing: Old login flow');
    expect(setStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(SPEC, TASK, { status: 'ready' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
