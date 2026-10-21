// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { ProjectCreationApi } from './api.project';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
import { createOptionsFixture } from './creationOptions.stories-support';

const created: CreatedSpec = {
  operationId: '00000000-0000-4000-8000-000000000001',
  specId: '00000000-0000-4000-8000-0000000000aa',
  kind: 'specification-create',
  status: 'completed',
  slug: 'title',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  relativeManifestPath: 'specs/active/title/specification.yaml',
};

function renderScreen(
  dataMode: 'project' | 'demo',
  projectCreationApi: Partial<ProjectCreationApi>,
  props: { specId?: string } = {},
) {
  const onProjectCreated = vi.fn();
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode }) },
    projectCreationApi: projectCreationApi as ProjectCreationApi,
  });
  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Nav</div>}>
                <CreateSpecificationScreen
                  {...props}
                  onCreated={vi.fn()}
                  onProjectCreated={onProjectCreated}
                  onSession={vi.fn()}
                  onBack={vi.fn()}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
  return { onProjectCreated };
}

beforeEach(() => {
  sessionStorage.clear();
  // jsdom lacks the layout observers the application shell subscribes to.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
    onchange: null,
  }));
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CreateSpecificationScreen on a project Runtime', () => {
  it('shows the real form (name, goal, workspace) without the demo workflow or agent', async () => {
    renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
    });
    expect(await screen.findByLabelText('Specification name')).toBeTruthy();
    expect(screen.getByLabelText('Goal (optional)')).toBeTruthy();
    expect(screen.queryByText('Workflow')).toBeNull();
    expect(screen.queryByText(/Creation is available in demo mode only/)).toBeNull();
  });

  it('creates against the real API with a new worktree and opens the created specification', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const { onProjectCreated } = renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
      create,
    });
    fireEvent.change(await screen.findByLabelText('Specification name'), {
      target: { value: 'Payment limits' },
    });
    fireEvent.change(screen.getByLabelText('Goal (optional)'), {
      target: { value: 'Limit refunds' },
    });
    const submit = await screen.findByRole('button', { name: 'Create specification' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledWith(created));
    const request = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(request).toMatchObject({ title: 'Payment limits', goal: 'Limit refunds' });
    expect(Object.keys(request).sort()).not.toContain('catalogueRevision');
    expect(Object.keys(request).sort()).not.toContain('archetypeId');
  });

  it('can create the new workspace (worktree) from the form: the request carries the new-worktree target', async () => {
    const create = vi.fn().mockResolvedValue(created);
    renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
      create,
    });
    fireEvent.change(await screen.findByLabelText('Specification name'), {
      target: { value: 'Payment limits' },
    });
    fireEvent.click(await screen.findByRole('radio', { name: /new workspace/i }));
    const submit = await screen.findByRole('button', { name: 'Create specification' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect((create.mock.calls[0]![0] as { target?: unknown }).target).toEqual({
      kind: 'new-worktree',
    });
  });

  it('explains that a session cannot be created on a project Runtime', async () => {
    renderScreen('project', {}, { specId: 'spec-1' });
    expect(await screen.findByText('Not available in this Runtime')).toBeTruthy();
  });
});
