// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { polishText } from '../../../i18n/testing';
import {
  operationItem,
  operationList,
  operationsStub,
  runningItem,
} from '../../../../test-support/operations/fixtures';
import { resetOperationsSession } from '../../../shared/operations/operationsSession';
import { specsOverviewKeys } from '../overview/queries';
import { createSpecFlowUiRegistry } from '../../../app/ui-modules/builtInUiModules';
import {
  specsOverviewPanels,
  type SpecsOverviewPanelContribution,
} from '../extensions/specsOverviewPanels';
import { CreateOperationsPanel } from './CreateOperationsPanel';
import { creationUiModule } from './uiModule';
import {
  createOperationKind,
  createOperationPageHref,
  createOperationsListUrl,
} from './operationKind';

afterEach(() => {
  cleanup();
  resetOperationsSession();
});

describe('Create operation kind', () => {
  it('reads the project list from the Specifications route and the demo list from the demo one', () => {
    expect(createOperationsListUrl('project')).toBe('/api/specs/operations');
    expect(createOperationsListUrl('demo')).toBe('/api/demo/specifications/operations');
  });

  it('reads nothing while the Runtime mode is unknown', () => {
    expect(createOperationsListUrl('loading')).toBeUndefined();
    expect(createOperationsListUrl('unavailable')).toBeUndefined();
  });

  it('links to the progress page and the events stream of the operation', () => {
    const row = operationItem({ operationId: '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60' });
    expect(createOperationKind.detailHref(row)).toBe(
      '/specs/new/creating/3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60',
    );
    expect(createOperationKind.eventsUrl?.(row)).toBe(
      '/api/specs/create/operations/3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60/events',
    );
    expect(createOperationPageHref('a b')).toBe('/specs/new/creating/a%20b');
  });

  it('names the public steps with the progress page copy and an unknown one generically', () => {
    expect(polishText(createOperationKind.stepTitle('writing-specification'))).toBe(
      'Tworzenie specyfikacji',
    );
    expect(createOperationKind.stepTitle('committing-specification')).toEqual({
      key: 'create.progress.steps.unknown.title',
    });
  });
});

function renderPanel(
  api: ReturnType<typeof operationsStub>,
  mode: Parameters<typeof CreateOperationsPanel>[0]['mode'],
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  render(
    <QueryClientProvider client={client}>
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <CreateOperationsPanel api={api} mode={mode} />
      </LocalizationProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe('CreateOperationsPanel', () => {
  it('shows the running Create from the API list with a link to its progress page', async () => {
    const item = runningItem(1, { title: 'Payment limits' });
    const api = operationsStub(operationList([item]));
    renderPanel(api, 'project');
    const link = await screen.findByRole('link', { name: /^Payment limits/ });
    expect(link.getAttribute('href')).toBe(`/specs/new/creating/${item.operationId}`);
    expect(api.calls[0]?.url).toBe('/api/specs/operations');
  });

  it('reads the demo list in demo mode', async () => {
    const api = operationsStub(operationList([runningItem(1)]));
    renderPanel(api, 'demo');
    await screen.findByRole('link');
    expect(api.calls[0]?.url).toBe('/api/demo/specifications/operations');
  });

  it('reads nothing and shows nothing until the mode is known', () => {
    const api = operationsStub(operationList([runningItem(1)]));
    renderPanel(api, 'loading');
    expect(api.calls).toHaveLength(0);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('stays hidden, calmly, when the Runtime has no list yet (404)', async () => {
    const api = operationsStub({ kind: 'unavailable' });
    renderPanel(api, 'project');
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refreshes the specification list when a Create completes', async () => {
    const running = runningItem(3);
    const done = { ...running, status: 'completed' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPanel(
        operationsStub(operationList([running]), operationList([done])),
        'project',
        client,
      );
      await screen.findByRole('link');
      await vi.advanceTimersByTimeAsync(3_100);
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: specsOverviewKeys.all }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Create contribution to the specification list', () => {
  const contribution = (): SpecsOverviewPanelContribution => {
    const registry = createSpecFlowUiRegistry([creationUiModule]);
    const [panel] = registry.get(specsOverviewPanels);
    if (!panel) throw new Error('The creation module contributes no overview panel.');
    return panel;
  };
  const context = (collection: 'current' | 'archive') => ({
    collection,
    mode: 'project' as const,
    operationsApi: operationsStub(),
  });

  it('adds the operations panel to the current collection only', () => {
    expect(contribution().render(context('current'))).not.toBeNull();
    expect(contribution().render(context('archive'))).toBeNull();
  });
});
