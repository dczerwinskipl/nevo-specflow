import { useMemo, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';

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
const accepted = {
  operationId: '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60',
  kind: 'specification-create' as const,
  status: 'in-progress' as const,
};
const createdSpec: CreatedSpec = {
  operationId: accepted.operationId,
  specId: '00000000-0000-4000-8000-0000000000aa',
  kind: 'specification-create',
  status: 'completed',
  slug: 'limity-platnosci',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  relativeManifestPath: 'specs/active/limity-platnosci/specification.yaml',
};
type StreamBehavior = 'steps' | 'unavailable' | 'completes';

/** Plays the Runtime's stream with short delays; the POST stays pending so the steps stay visible. */
function operationsFor(behavior: StreamBehavior, onCompleted: () => void): OperationsApi {
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
      if (behavior === 'completes') {
        // The journal is complete before the stream says so (the Runtime's order).
        onCompleted();
        yield { ...operationBase, type: 'completed', result: createdSpec };
        return;
      }
      await new Promise<void>((resolve) =>
        signal?.addEventListener('abort', () => resolve(), { once: true }),
      );
    },
  };
}

function Fixture({
  stream = 'steps',
  onProjectCreated = () => undefined,
}: {
  stream?: StreamBehavior;
  onProjectCreated?: (created: CreatedSpec) => void;
}) {
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  const completed = useRef(false);
  const services = useMemo(
    () =>
      createSpecFlowAppServices({
        runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
        projectCreationApi: {
          createOptions: () => Promise.resolve(createOptionsFixture('default')),
          // Async mode: the Runtime accepts (202) and the operation is "running" until the end.
          create: () => Promise.resolve(accepted),
          inspectOperation: () => Promise.resolve(completed.current ? createdSpec : accepted),
          operationEventsUrl: createOperationEventsUrl,
        },
        operationsApi: operationsFor(stream, () => {
          completed.current = true;
        }),
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
                  onProjectCreated={onProjectCreated}
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
    // The operation is accepted and watched through the inspection endpoint: a calm note says so.
    await expect(await context.canvas.findByText(/Zostaw tę stronę otwartą/)).toBeInTheDocument();
  },
};

/** The stream ends with `completed`: the inspection is read at once and the specification opens. */
export const CompletedEventOpensTheSpecification: Story = {
  args: { stream: 'completes', onProjectCreated: fn() },
  play: async (context) => {
    await submit(context);
    await waitFor(() => expect(context.args.onProjectCreated).toHaveBeenCalledWith(createdSpec), {
      timeout: 4000,
    });
  },
};
