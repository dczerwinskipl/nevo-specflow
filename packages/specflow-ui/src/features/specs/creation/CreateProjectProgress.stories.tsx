import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';

import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { withLocale } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
import { createOperationEventsUrl } from './api.project';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
import { createOptionsFixture } from './creationOptions.stories-support';

const operationBase = {
  operationId: '00000000-0000-4000-8000-000000000001',
  kind: 'specification-create',
  at: '2026-10-20T14:32:08Z',
};
type StreamBehavior = 'steps' | 'unavailable';

/** Plays the Runtime's stream with short delays; the POST stays pending so the steps stay visible. */
function operationsFor(behavior: StreamBehavior): OperationsApi {
  const events: readonly OperationProgressEvent[] = [
    {
      ...operationBase,
      type: 'snapshot',
      status: 'running',
      steps: [
        { id: 'reserving', status: 'running' },
        { id: 'preparing-workspace', status: 'pending' },
        { id: 'writing-specification', status: 'pending' },
        { id: 'registering', status: 'pending' },
      ],
    },
    { ...operationBase, type: 'step', step: 'reserving', status: 'done' },
    { ...operationBase, type: 'step', step: 'preparing-workspace', status: 'running' },
  ];
  return {
    async *watchProgress(_streamUrl, signal) {
      if (behavior === 'unavailable') throw new Error('Stream unavailable');
      for (const event of events) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (signal?.aborted) return;
        yield event;
      }
      await new Promise<void>((resolve) =>
        signal?.addEventListener('abort', () => resolve(), { once: true }),
      );
    },
  };
}

function Fixture({ stream = 'steps' }: { stream?: StreamBehavior }) {
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  const services = useMemo(
    () =>
      createSpecFlowAppServices({
        runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
        projectCreationApi: {
          createOptions: () => Promise.resolve(createOptionsFixture('default')),
          // Pending on purpose: the operation is "running" for the whole story.
          create: () => new Promise<CreatedSpec>(() => undefined),
          inspectOperation: () =>
            Promise.resolve({
              operationId: operationBase.operationId,
              kind: 'specification-create' as const,
              status: 'in-progress' as const,
            }),
          operationEventsUrl: createOperationEventsUrl,
        },
        operationsApi: operationsFor(stream),
      }),
    [stream],
  );
  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div style={{ width: '100%', height: '100vh' }}>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Projekt</div>} style={{ height: '100%', width: '100%' }}>
                <CreateSpecificationScreen
                  onCreated={() => undefined}
                  onProjectCreated={() => undefined}
                  onSession={() => undefined}
                  onBack={() => undefined}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </div>
        </VisitStateProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Features/Specification Creation/Live Progress',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  // A running operation is kept in sessionStorage; every story starts without one.
  beforeEach: () => sessionStorage.clear(),
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
type Context = Parameters<NonNullable<Story['play']>>[0];

async function submit({ canvas, userEvent }: Context) {
  await userEvent.type(await canvas.findByLabelText('Nazwa specyfikacji'), 'Limity płatności');
  await userEvent.click(await canvas.findByRole('radio', { name: 'Nowe środowisko pracy' }));
  const button = await canvas.findByRole('button', { name: 'Utwórz specyfikację' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
}

/** The form stays calm: a step checklist appears under the form while the Runtime works. */
export const StepsWhileCreating: Story = {
  play: async (context) => {
    await submit(context);
    const region = await context.canvas.findByRole('status', {
      name: 'Postęp tworzenia specyfikacji',
    });
    await expect(region).toHaveAttribute('aria-live', 'polite');
    const running = await context.canvas.findByText('Przygotowanie środowiska pracy');
    await waitFor(() => expect(running.closest('li')).toHaveAttribute('aria-current', 'step'));
    await expect(context.canvas.getByText('Rezerwowanie nazwy').closest('li')).toHaveAttribute(
      'data-status',
      'done',
    );
  },
};

/** No stream (older Runtime, proxy without SSE): no checklist, no error, the create goes on. */
export const NoStreamFallsBackSilently: Story = {
  args: { stream: 'unavailable' },
  play: async (context) => {
    await submit(context);
    await waitFor(() =>
      expect(
        context.canvas.queryByRole('status', { name: 'Postęp tworzenia specyfikacji' }),
      ).toBeNull(),
    );
    await expect(context.canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(context.canvas.getByRole('button', { name: /Przygotowywanie/ })).toBeDisabled();
  },
};
