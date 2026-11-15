// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskTypeOption } from '@nevo/specflow-contracts/workflow';
import { SPEC, fakeTaskAuthoringApi, refusal, renderWithAuthoring } from './authoring.test-support';
import { NewTaskDialog } from './NewTaskDialog';

afterEach(cleanup);

const types: TaskTypeOption[] = [
  {
    id: 'backend',
    title: 'Backend',
    description: 'Server or Engine change.',
    useWhen: 'Server work',
    workflow: {
      id: 'build',
      title: 'Build and review',
      steps: [
        { id: 'implement', title: 'Implementation' },
        { id: 'review', title: 'Review' },
      ],
    },
  },
  {
    id: 'ui',
    title: 'UI',
    description: 'Screen change.',
    useWhen: 'UI work',
    workflow: { id: 'ui-build', title: 'UI build', steps: [{ id: 'implement', title: 'Impl' }] },
  },
];

function open(api = fakeTaskAuthoringApi(), onOpenChange = vi.fn()) {
  renderWithAuthoring(
    <NewTaskDialog
      specId={SPEC}
      specTitle="Single sign-on"
      open
      onOpenChange={onOpenChange}
      taskTypes={types}
      tasks={[{ id: 't-02', title: 'Token exchange' }]}
    />,
    api,
  );

  return { api, onOpenChange };
}

function fill() {
  fireEvent.click(screen.getByRole('radio', { name: 'Backend' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Task id' }), {
    target: { value: 't-07' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
    target: { value: 'Rate-limit session refresh' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 't-02 · Token exchange' }));
}

describe('NewTaskDialog', () => {
  it('offers only the projected task types, each with its workflow steps by title', () => {
    open();

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(
      screen.getByText(
        'Server or Engine change. Workflow: Build and review (Implementation → Review).',
      ),
    ).toBeTruthy();
  });

  it('creates a draft of the chosen type with its dependencies and closes', async () => {
    const createTask = vi.fn(() => Promise.resolve({ taskId: 't-07', revision: 'r1' }));
    const { onOpenChange } = open(fakeTaskAuthoringApi({ createTask }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(createTask).toHaveBeenCalledWith(SPEC, {
      taskId: 't-07',
      title: 'Rate-limit session refresh',
      type: 'backend',
      dependsOn: ['t-02'],
    });
  });

  it('checks the id format before sending anything', () => {
    const { api } = open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Task id' }), {
      target: { value: 'Bad Id' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(screen.getByText(/Use lowercase letters, digits and dashes/)).toBeTruthy();
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('explains a refusal by its code and keeps the form', async () => {
    const createTask = vi.fn(() => Promise.reject(refusal('WORKFLOW_TASK_EXISTS')));
    const { onOpenChange } = open(fakeTaskAuthoringApi({ createTask }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('A task with this id exists already.');
    expect(alert.textContent).not.toContain('display only');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Task id' }).value).toBe('t-07');
  });
});
