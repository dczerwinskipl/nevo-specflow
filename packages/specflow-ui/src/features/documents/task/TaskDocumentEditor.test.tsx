// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  useSecondaryNavigation,
} from '@nevo/ui';
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../test-support/app/stubLayoutApis';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { taskDocumentScope } from '../api';
import { createDocumentDraftStore } from '../editor/documentDraftStore';
import { DocumentDraftProvider } from '../editor/DocumentDraftProvider';
import { TaskDocumentEditorHost, taskDocumentStack } from './TaskDocumentEditor';

const SPEC = 'sso';
const TASK = 't-04';
const scope = taskDocumentScope(SPEC, TASK);

beforeEach(stubLayoutApis);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Controls() {
  const navigation = useSecondaryNavigation();
  const [left, setLeft] = useState<string>('');

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          void navigation.openTab(taskDocumentStack, { documentId: 'task', name: 'task.md' })
        }
      >
        open-task
      </button>
      <button
        type="button"
        onClick={() =>
          void navigation.openTab(taskDocumentStack, { documentId: 'screens', name: 'screens.md' })
        }
      >
        open-screens
      </button>
      <button type="button" onClick={() => void navigation.closeTab('task-document:task')}>
        close-task
      </button>
      <button
        type="button"
        onClick={() => void navigation.canLeaveScope().then((allowed) => setLeft(String(allowed)))}
      >
        leave-route
      </button>
      <output data-testid="left">{left}</output>
      <output data-testid="tabs">{navigation.tabs.tabs.map((tab) => tab.id).join(',')}</output>
    </div>
  );
}

async function setup() {
  const store = createDocumentDraftStore();
  // An edited task.md: its draft differs from the version on disk.
  store.set(scope, 'task', {
    content: 'edited',
    baseline: 'saved',
    revision: 'f1',
    editing: false,
  });
  const services = createSpecFlowAppServices({
    documentApi: {
      getDocument: (_scope, id) =>
        Promise.resolve(
          documentContentFixture({ id, path: `${id}.md`, content: 'saved', revision: 'f1' }),
        ),
    },
  });
  const view = render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <DocumentDraftProvider store={store}>
            <AppWorkspaceProvider>
              <TaskDocumentEditorHost specId={SPEC} taskId={TASK} writable>
                <AppShell navigation={<div>Nav</div>}>
                  <AppWorkspace split="primary">
                    <AppWorkspace.Primary header={<WorkspaceHeader title="Task" />}>
                      <Controls />
                    </AppWorkspace.Primary>
                  </AppWorkspace>
                </AppShell>
              </TaskDocumentEditorHost>
            </AppWorkspaceProvider>
          </DocumentDraftProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('open-task'));
  // The document loads and its edit session (dirty) is on screen.
  await screen.findByText('unsaved changes');

  return { store, view };
}

const question = () => screen.queryByText(/task\.md has unsaved changes/);

describe('Task document leave guard', () => {
  it('asks before closing a dirty tab; Keep editing keeps it and its draft', async () => {
    const { store } = await setup();
    fireEvent.click(screen.getByText('close-task'));

    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    await waitFor(() => expect(question()).toBeNull());
    expect(screen.getByTestId('tabs').textContent).toBe('task-document:task');
    expect(store.get(scope, 'task')?.content).toBe('edited');
  });

  it('drops the draft only once the tab is really closed after Discard', async () => {
    const { store } = await setup();
    fireEvent.click(screen.getByText('close-task'));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.getByTestId('tabs').textContent).toBe(''));
    expect(store.get(scope, 'task')).toBeUndefined();
  });

  it('asks before switching to another document', async () => {
    await setup();
    fireEvent.click(screen.getByText('open-screens'));

    await waitFor(() => expect(question()).not.toBeNull());
  });

  it('asks on a route change and keeps the draft until the screen is left', async () => {
    const { store, view } = await setup();
    fireEvent.click(screen.getByText('leave-route'));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.getByTestId('left').textContent).toBe('true'));
    // The route has not changed yet: the draft is still there.
    expect(store.get(scope, 'task')?.content).toBe('edited');
    await act(async () => {
      view.unmount();
      await Promise.resolve();
    });
    expect(store.get(scope, 'task')).toBeUndefined();
  });
});
