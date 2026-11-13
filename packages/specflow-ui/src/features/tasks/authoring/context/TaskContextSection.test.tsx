// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import {
  SPEC,
  TASK,
  fakeTaskAuthoringApi,
  refusal,
  renderWithAuthoring,
  resourceFixture,
  taskProjection,
} from '../authoring.test-support';
import type { TaskAuthoringApi } from '../api';
import { contextView } from './contextModel';
import { TaskContextSection } from './TaskContextSection';

afterEach(cleanup);

const names = {
  taskDocuments: new Map([
    ['task', 'task.md'],
    ['screens', 'screens.md'],
  ]),
  specificationDocuments: new Map([
    ['overview', 'Overview'],
    ['ux', 'UX'],
    ['old-flow', 'Old login flow'],
  ]),
};

function renderSection(
  api: TaskAuthoringApi,
  resource: TaskResourceFacts = resourceFixture(),
  projection = taskProjection(),
) {
  renderWithAuthoring(
    <TaskContextSection
      specId={SPEC}
      specTitle="Single sign-on"
      taskId={TASK}
      revision={resource.revision}
      view={contextView(resource, projection, 'overview')}
      names={names}
      specificationDocuments={[
        { id: 'overview', title: 'Overview', filename: 'overview.md' },
        { id: 'ux', title: 'UX', filename: 'ux.md' },
      ]}
      editable
      collapsible={false}
      openTarget={() => undefined}
      onLoadLatest={vi.fn()}
    />,
    api,
  );
}

function addSpecificationDocument(title: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Add context' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Specification document' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: title }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add to context' }));

  return dialog;
}

describe('TaskContextSection', () => {
  it('writes the default context out with the added entry appended, at the read revision', async () => {
    const editTask = vi.fn(() => Promise.resolve({ taskId: TASK, revision: 'rev-2' }));
    renderSection(fakeTaskAuthoringApi({ editTask }));

    // The default: task.md, the Task's documents and the Specification overview; the overview is
    // already in context, so only UX can be picked.
    expect(screen.getByText('3 entries')).toBeTruthy();
    addSpecificationDocument('UX');

    await waitFor(() => expect(editTask).toHaveBeenCalled());
    expect(editTask).toHaveBeenCalledWith(SPEC, TASK, {
      expectedRevision: 'rev-1',
      context: [
        { kind: 'task-document', id: 'task', required: true },
        { kind: 'task-document', id: 'screens', required: true },
        { kind: 'specification-document', id: 'overview', required: true },
        { kind: 'specification-document', id: 'ux', required: true },
      ],
    });
  });

  it('names the entries the Engine refused as unresolved', async () => {
    const editTask = vi.fn(() =>
      Promise.reject(
        refusal('WORKFLOW_TASK_CONTEXT_UNRESOLVED', 422, {
          unresolved: [{ index: 3, key: 'specification-document:ux', reason: 'not-found' }],
        }),
      ),
    );
    renderSection(fakeTaskAuthoringApi({ editTask }));
    const dialog = addSpecificationDocument('UX');

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('Some context entries do not resolve:');
    expect(alert.textContent).toContain('UX does not resolve.');
  });

  it("explains the refusal of the Task's own document as a required artifact", async () => {
    const editTask = vi.fn(() =>
      Promise.reject(
        refusal('WORKFLOW_INPUT_INVALID', 422, {
          invalidContext: [
            { index: 3, key: 'specification-document:ux', reason: 'required-own-artifact' },
          ],
        }),
      ),
    );
    renderSection(fakeTaskAuthoringApi({ editTask }));
    const dialog = addSpecificationDocument('UX');

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain("Not added: this is the task's own document");
    expect(alert.textContent).toContain('exit gate');
  });

  it('lists the entries that need attention first, then every entry in declared order', () => {
    const resource = resourceFixture({
      context: [
        { kind: 'task-document', id: 'task', required: true },
        { kind: 'specification-document', id: 'ux', required: true },
        { kind: 'specification-document', id: 'findings', required: true, artifact: true },
        { kind: 'specification-document', id: 'old-flow', required: true },
      ],
    });
    renderSection(
      fakeTaskAuthoringApi(),
      resource,
      taskProjection([
        {
          kind: 'context-unresolved',
          entries: [{ index: 3, kind: 'specification-document', reason: 'not-found' }],
        },
        { kind: 'context-awaited', entries: [{ index: 2, kind: 'specification-document' }] },
      ]),
    );

    const headings = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings()).toEqual(['findings', 'Old login flow']);
    expect(screen.getByText('1 required entry is missing.')).toBeTruthy();
    expect(screen.getByText(/Awaited: findings is created earlier/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show all 4 entries in order' }));
    expect(headings()).toEqual(['task.md', 'UX', 'findings', 'Old login flow']);
  });
});
