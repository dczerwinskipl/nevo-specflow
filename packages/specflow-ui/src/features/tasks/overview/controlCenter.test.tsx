// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { createAuthStore } from '../../../auth/store';
import { createSpecFlowRouter } from '../../../app/router';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { appI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { installWorkspaceWidth } from '../../../test-support/workspaceWidth.test-support';
import { fakeTaskAuthoringApi } from '../authoring/authoring.test-support';
import { SPEC } from '../execution/projections.stories-support';
import {
  controlCenterProjection,
  controlCenterTaskList,
  controlCenterWorkspace,
  type ControlCenterScenario,
} from './controlCenter.stories-support';

beforeEach(async () => {
  installWorkspaceWidth(1400);
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
  await appI18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const local: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local', name: 'Local' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};

async function renderAt(
  url: string,
  scenario: ControlCenterScenario,
  workspace: () => Promise<SpecificationWorkspaceResponse> = () => controlCenterWorkspace(scenario),
  start = vi.fn(() => Promise.resolve({}) as never),
) {
  const router = createSpecFlowRouter(
    createMemoryHistory({ initialEntries: [url] }),
    createSpecFlowAppServices({
      authStore: createAuthStore(
        {
          getSession: () => Promise.resolve(local),
          loginWithPassword: () => Promise.reject(new Error('unused')),
          startOidc: () => Promise.reject(new Error('unused')),
          logout: () => Promise.resolve(),
        },
        local,
      ),
      runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
      specificationApi: { getSpecificationWorkspace: workspace },
      taskApi: {
        getTask: () => new Promise(() => undefined),
        getTaskList: (_specId, query) =>
          Promise.resolve(controlCenterTaskList(scenario, query.blocking === 'specification')),
      },
      taskAuthoringApi: fakeTaskAuthoringApi({
        specificationActions: vi.fn(() => Promise.resolve(controlCenterProjection(scenario))),
      }),
      workflowExecutionApi: {
        start,
        finish: vi.fn(),
        returnTo: vi.fn(),
        abandon: vi.fn(),
        closePreview: vi.fn(),
        close: vi.fn(),
      },
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UiModulesProvider modules={builtInUiModuleRegistry}>
        <RouterProvider router={router} />
      </UiModulesProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return { router, start };
}

describe('Specification control center', () => {
  it('explains why it is stuck in Now and opens the blocking Tasks from Review tasks', async () => {
    const { router } = await renderAt(`/specs/${SPEC}`, 'stuck');
    const now = await screen.findByRole('region', { name: 'Now' });

    await waitFor(() =>
      expect(now.querySelector('[data-now-stuck]')?.textContent).toBe(
        'It cannot continue now: T-04 is a draft, T-05 is on hold and no other task is open.',
      ),
    );
    expect(within(now).getByRole('link', { name: 'T-04' }).getAttribute('href')).toContain(
      `/specs/${SPEC}/tasks/T-04`,
    );
    // Now explains; it offers no action while the workflow waits by itself.
    expect(now.querySelector('[data-slot="workflow-actions"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Review tasks' }));
    const bar = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-blocking-filter]');
      expect(element).not.toBeNull();

      return element!;
    });
    expect(router.state.location.pathname).toBe(`/specs/${SPEC}/tasks`);
    expect(router.state.location.search).toMatchObject({ blocking: 'specification' });
    await waitFor(() => expect(bar.textContent).toContain('Blocking specification · 2 tasks'));

    fireEvent.click(
      within(bar).getByRole('button', { name: 'Clear filter: blocking specification' }),
    );
    await waitFor(() => expect(document.querySelector('[data-blocking-filter]')).toBeNull());
    expect(router.state.location.search).not.toHaveProperty('blocking');
  });

  it('refreshes Requires attention and the Tasks summary after a Task command', async () => {
    let started = false;
    const workspace = async () => {
      const response = await controlCenterWorkspace('waiting');
      if (!started || response.sections.tasks.state !== 'available') {
        return response;
      }

      // After the start the Runtime no longer reports T-02's attention item.
      const tasks = response.sections.tasks.data;

      return {
        ...response,
        sections: {
          ...response.sections,
          tasks: {
            state: 'available' as const,
            data: {
              ...tasks,
              attention: tasks.attention.filter((item) => item.targetId !== 'T-02'),
              overview: {
                ...tasks.overview,
                rows: tasks.overview.rows.map((row) =>
                  row.groupId === 'in-progress'
                    ? {
                        ...row,
                        tasks: [
                          { id: 'T-02', title: 'Token exchange endpoint and session cookie' },
                        ],
                      }
                    : row,
                ),
              },
            },
          },
        },
      };
    };

    const start = vi.fn(() => {
      started = true;

      return Promise.resolve({}) as never;
    });
    await renderAt(`/specs/${SPEC}`, 'waiting', workspace, start);

    fireEvent.click(await screen.findByRole('button', { name: 'Start Implementation' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({ specId: SPEC, taskId: 'T-02' }, {}));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Start Implementation' })).toBeNull(),
    );
    expect(document.querySelector('[data-summary-group="in-progress"]')?.textContent).toContain(
      'T-02 Token exchange endpoint and session cookie',
    );
  });
});
