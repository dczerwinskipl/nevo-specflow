// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPEC,
  TASK,
  fakeTaskAuthoringApi,
  refusal,
  renderWithAuthoring,
} from './authoring.test-support';
import { EditTaskDetailsDialog } from './EditTaskDetailsDialog';

afterEach(cleanup);

describe('EditTaskDetailsDialog', () => {
  it('saves title and summary against the revision it was opened at', async () => {
    const editTask = vi.fn(() => Promise.resolve({ taskId: TASK, revision: 'rev-2' }));
    const onOpenChange = vi.fn();
    renderWithAuthoring(
      <EditTaskDetailsDialog
        specId={SPEC}
        taskId={TASK}
        typeTitle="UI"
        open
        onOpenChange={onOpenChange}
        current={{ revision: 'rev-1', title: 'Return users', summary: '' }}
        reload={() => Promise.resolve(undefined)}
      />,
      fakeTaskAuthoringApi({ editTask }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Return users to where they were' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(editTask).toHaveBeenCalledWith(SPEC, TASK, {
      expectedRevision: 'rev-1',
      title: 'Return users to where they were',
      summary: null,
    });
    // The Task Type is shown, never editable.
    expect(screen.getByText('UI')).toBeTruthy();
  });

  it('keeps the edits on a revision conflict and loads the latest version on request', async () => {
    const editTask = vi.fn(() => Promise.reject(refusal('WORKFLOW_TASK_REVISION_CONFLICT')));
    const reload = vi.fn(() =>
      Promise.resolve({ revision: 'rev-2', title: 'Changed elsewhere', summary: 'New summary' }),
    );
    renderWithAuthoring(
      <EditTaskDetailsDialog
        specId={SPEC}
        taskId={TASK}
        typeTitle="UI"
        open
        onOpenChange={vi.fn()}
        current={{ revision: 'rev-1', title: 'Return users', summary: '' }}
        reload={reload}
      />,
      fakeTaskAuthoringApi({ editTask }),
    );
    const title = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Title' });
    fireEvent.change(title(), { target: { value: 'My title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Not saved: t-04 changed since you opened it');
    expect(title().value).toBe('My title');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Copy my changes' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load the latest version' }));
    await waitFor(() => expect(title().value).toBe('Changed elsewhere'));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(editTask).toHaveBeenCalledTimes(2));
    expect(editTask).toHaveBeenLastCalledWith(SPEC, TASK, {
      expectedRevision: 'rev-2',
      title: 'Changed elsewhere',
      summary: 'New summary',
    });
  });
});
