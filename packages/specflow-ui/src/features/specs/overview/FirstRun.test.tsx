// @vitest-environment jsdom
import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowRouter } from '../../../app/router';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowUiRegistry } from '../../../app/ui-modules/builtInUiModules';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { createAuthStore } from '../../../auth/store';
import { ApiError } from '../../../api';
import { createSpecFlowAppServices } from '../../../services';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { stubLayoutApis } from '../../../../test-support/app/stubLayoutApis';
import { createSpecsFixture } from '../../../../test-support/specs/overview/fixtures';
import { catalogue } from '../creation/options/creationCatalogue.stories-support';
import {
  createOptionsWireFixture,
  workspaceApiFixture,
} from '../creation/options/creationOptions.stories-support';

const local: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local', name: 'Local' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};
const missing: ArchetypeCatalogue = { ...catalogue, archetypes: [] };
const invalid: ArchetypeCatalogue = {
  ...missing,
  problems: [
    {
      source: 'specification-archetype/feature.yaml',
      code: 'yaml-invalid',
      severity: 'error',
      message: 'Invalid YAML',
    },
  ],
};

beforeEach(stubLayoutApis);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openOverview(
  archetypes: () => Promise<ArchetypeCatalogue>,
  {
    mode = 'project',
    collection = 'current',
    empty = true,
  }: {
    mode?: 'project' | 'demo';
    collection?: 'current' | 'archive';
    empty?: boolean;
  } = {},
) {
  const defaults = createSpecFlowAppServices();
  const services = createSpecFlowAppServices({
    authStore: createAuthStore(
      {
        getSession: () => Promise.resolve(local),
        loginWithPassword: () => Promise.reject(new Error('unused')),
        startOidc: () => Promise.reject(new Error('unused')),
        logout: () => Promise.resolve(),
      },
      local,
    ),
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: mode }) },
    specsOverviewApi: {
      getOverview: (selected) =>
        Promise.resolve({
          ...createSpecsFixture(selected),
          ...(empty ? { items: [] } : {}),
        }),
    },
    projectCreationApi: {
      ...defaults.projectCreationApi,
      archetypes,
      createOptions: () => Promise.resolve(createOptionsWireFixture()),
    },
    workspaceApi: workspaceApiFixture(),
  });
  const router = createSpecFlowRouter(
    createMemoryHistory({ initialEntries: [`/?collection=${collection}`] }),
    services,
  );
  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <UiModulesProvider modules={createSpecFlowUiRegistry([])}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <RouterProvider router={router} />
        </LocalizationProvider>
      </UiModulesProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'Specifications', level: 1 });
  await act(async () => {
    await Promise.resolve();
  });

  return router;
}

describe('first-run Specifications through the real route', () => {
  it.each([
    [missing, 'definitions install --add-missing'],
    [invalid, 'definitions validate'],
  ])(
    'explains unavailable definitions and refreshes after repair without hiding Create',
    async (unavailable, command) => {
      let served = unavailable;
      const read = vi.fn(() => Promise.resolve(served));
      const router = await openOverview(read);
      expect(
        await screen.findByText(
          /This project has no available archetypes|The archetype definitions contain errors/,
        ),
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', {
          name: command.includes('install') ? 'How to add an archetype?' : 'How to fix it?',
        }),
      );
      const help = await screen.findByRole('dialog');
      expect(within(help).getByText(new RegExp(command))).toBeTruthy();
      fireEvent.click(within(help).getByRole('button', { name: 'Close' }));
      expect(screen.queryByText('Create a specification to start working.')).toBeNull();
      expect(screen.getByRole('button', { name: 'New specification' })).toBeTruthy();

      served = catalogue;
      const calls = read.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(read.mock.calls.length).toBe(calls + 1));
      await waitFor(() => expect(screen.queryByText(new RegExp(command))).toBeNull());
      fireEvent.click(screen.getByRole('button', { name: 'New specification' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/specs/new'));
    },
  );

  it('keeps a failed availability read distinct from missing definitions and retries it', async () => {
    const read = vi
      .fn<() => Promise<ArchetypeCatalogue>>()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(catalogue);
    await openOverview(read);
    expect(await screen.findByText(/archetypes could not be loaded/)).toBeTruthy();
    expect(screen.queryByText(/definitions install/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText(/archetypes could not be loaded/)).toBeNull());
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not mistake denied catalogue access for an empty installation', async () => {
    await openOverview(() =>
      Promise.reject(
        new ApiError({
          kind: 'forbidden',
          operation: 'specs.create.archetypes',
          outcome: 'not-applied',
          retryable: false,
          status: 403,
        }),
      ),
    );
    expect(
      await screen.findByText('You do not have permission to create specifications.'),
    ).toBeTruthy();
    expect(screen.queryByText(/definitions install/)).toBeNull();
  });

  it.each([{ collection: 'archive' as const }, { empty: false }, { mode: 'demo' as const }])(
    'does not read project Create availability outside the empty current project collection: %j',
    async (options) => {
      const read = vi.fn(() => Promise.resolve(missing));
      await openOverview(read, options);
      expect(read).not.toHaveBeenCalled();
    },
  );
});
