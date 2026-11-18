// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskDocumentTree } from '@nevo/specflow-contracts/tasks';
import { SPEC, TASK, fakeTaskAuthoringApi, renderWithAuthoring } from '../authoring.test-support';
import { TaskDocumentsSection } from './TaskDocumentsSection';

afterEach(cleanup);

const tree = (capabilities: TaskDocumentTree['capabilities']): TaskDocumentTree => ({
  taskId: TASK,
  registryRevision: 'registry-1',
  capabilities,
  documents: [
    {
      id: 'task',
      path: 'task.md',
      type: 'task',
      classification: 'registered',
      required: true,
      file: { kind: 'text', mediaType: 'text/markdown', size: 10, revision: 'r1', editable: true },
    },
    {
      id: 'notes',
      path: 'notes.md',
      type: 'note',
      classification: 'registered',
      required: false,
      file: { kind: 'text', mediaType: 'text/markdown', size: 10, revision: 'r2', editable: true },
    },
  ],
});

function renderSection(capabilities: TaskDocumentTree['capabilities'], ownContext = false) {
  const api = fakeTaskAuthoringApi({
    documentTree: vi.fn(() => Promise.resolve(tree(capabilities))),
  });
  renderWithAuthoring(
    <TaskDocumentsSection
      specId={SPEC}
      taskId={TASK}
      ownContext={ownContext}
      onOpenDocument={() => undefined}
    />,
    api,
  );
}

describe('TaskDocumentsSection capabilities', () => {
  it('offers adding, renaming and deleting only where the Runtime organizes documents', async () => {
    renderSection({ save: true, organize: true });
    await screen.findByText('notes.md');
    expect(screen.queryByRole('button', { name: 'New document' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for notes.md' })).not.toBeNull();
  });

  it('offers no document action that would be refused when the Runtime only saves (demo)', async () => {
    renderSection({ save: true, organize: false });
    await screen.findByText('notes.md');
    expect(screen.queryByRole('button', { name: 'New document' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for notes.md' })).toBeNull();
  });

  it('says in the New document dialog that an own-list context does not take the new document', async () => {
    renderSection({ save: true, organize: true }, true);
    await screen.findByText('notes.md');
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(screen.getByRole('dialog').textContent).toContain(
      'It is not added to the context, because this task has its own list.',
    );
  });

  it('says nothing about the context while it is the default', async () => {
    renderSection({ save: true, organize: true });
    await screen.findByText('notes.md');
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(screen.getByRole('dialog').textContent).not.toContain('own list');
  });
});
