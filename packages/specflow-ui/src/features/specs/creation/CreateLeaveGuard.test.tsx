// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
import { createOperationEventsUrl, type ProjectCreationApi } from './api/api.project';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
import { createOptionsFixture } from './options/creationOptions.stories-support';
import { catalogue } from './options/creationCatalogue.stories-support';

/** What the project form tells the leave guard, read through the real hook. */
const dirtyValues: boolean[] = [];
vi.mock('./form/useCreateLeaveGuard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./form/useCreateLeaveGuard')>();

  return {
    ...actual,
    useCreateLeaveGuard: (options: Parameters<typeof actual.useCreateLeaveGuard>[0]) => {
      dirtyValues.push(options.dirty);

      return actual.useCreateLeaveGuard(options);
    },
  };
});

const operations: OperationsApi = {
  list: () => Promise.resolve({ kind: 'unavailable' as const }),
  // eslint-disable-next-line require-yield
  async *watchProgress() {
    await Promise.resolve();
  },
};

function renderProject() {
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
    projectCreationApi: {
      operationEventsUrl: createOperationEventsUrl,
      archetypes: () => Promise.resolve(catalogue),
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
      create: vi.fn(),
    } as unknown as ProjectCreationApi,
    operationsApi: operations,
  });
  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Nav</div>}>
                <CreateSpecificationScreen
                  onCreated={vi.fn()}
                  onProjectStarted={vi.fn()}
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
}

const dirty = () => dirtyValues.at(-1);

beforeEach(() => {
  dirtyValues.length = 0;
  sessionStorage.clear();
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

describe('the leave guard measures the request, not the form', () => {
  it('"Change" and "Restore default" on a row leave the form clean; a real override does not', async () => {
    renderProject();
    await screen.findByRole('radio', { name: /new workspace/i });
    await screen.findByRole('radio', { name: /Feature/ });
    expect(dirty()).toBe(false);

    // Opening rows prefills their defaults: the request is the same, nothing to confirm.
    fireEvent.click(screen.getByRole('button', { name: 'Change: Branch name' }));
    await screen.findByLabelText('New branch name');
    fireEvent.click(screen.getByRole('button', { name: 'Change: Start from' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Start from' })).toBeTruthy());
    expect(dirty()).toBe(false);

    // A typed branch that differs is an edit worth confirming before leaving.
    fireEvent.change(screen.getByLabelText('New branch name'), {
      target: { value: 'feature/own' },
    });
    await waitFor(() => expect(dirty()).toBe(true));

    // Restoring the defaults makes the form clean again.
    fireEvent.click(screen.getByRole('button', { name: 'Restore default: Branch name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore default: Start from' }));
    await waitFor(() => expect(dirty()).toBe(false));
  });
});
