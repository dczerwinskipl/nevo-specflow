import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../../services';
import {
  antigravityTurnedOff,
  claudeDescriptor,
  codexNotFound,
  managedProviders,
  unavailableProviders,
} from '../../../sessions/start/catalogue/providerDescriptors.stories-support';
import { CreateSpecificationScreen } from '../CreateSpecificationScreen';
import { catalogue as storyCatalogue } from '../options/creationCatalogue.stories-support';
import {
  createOptionsWireFixture,
  workspaceApiFixture,
} from '../options/creationOptions.stories-support';
import { createSessionOperationStorage } from '../operation/createOperationStorage';

/** The project catalogue with each archetype's first step: Feature's is an agent's, Minimal's the owner's. */
const catalogue: DemoCatalogue = {
  ...storyCatalogue,
  archetypes: storyCatalogue.archetypes.map((archetype, index) => ({
    ...archetype,
    firstStep:
      index === 0
        ? { id: 'requirements', title: 'Zbieranie wymagań', agent: true }
        : { id: 'overview', title: 'Napisz przegląd', agent: false },
  })),
};

function Fixture({
  providers = managedProviders,
  onProjectStarted = () => undefined,
}: {
  providers?: ProviderDescriptor[];
  onProjectStarted?: (operationId: string) => void;
}) {
  const client = useMemo(createSpecFlowQueryClient, []);
  useMemo(() => sessionStorage.clear(), []);
  const services = useMemo(() => {
    const defaults = createSpecFlowAppServices();

    return createSpecFlowAppServices({
      runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
      workspaceApi: workspaceApiFixture('default'),
      projectCreationApi: {
        ...defaults.projectCreationApi,
        archetypes: () => Promise.resolve(catalogue),
        createOptions: () => Promise.resolve(createOptionsWireFixture('default')),
      },
      managedSessionsApi: {
        ...defaults.managedSessionsApi,
        providers: () => Promise.resolve({ items: providers }),
      },
    });
  }, [providers]);

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <VisitStateProvider>
          <div style={{ width: '100%', height: '100vh' }}>
            <AppWorkspaceProvider>
              <AppShell navigation={<div />} style={{ height: '100%', width: '100%' }}>
                <CreateSpecificationScreen
                  onProjectStarted={onProjectStarted}
                  onCreated={() => undefined}
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
  title: 'SpecFlow/Screens/Create choice',
  component: Fixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  beforeEach: () => sessionStorage.clear(),
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const tiles = (canvas: { getAllByRole: (role: string) => HTMLElement[] }) =>
  canvas.getAllByRole('listitem');

/** The ways to start, Manually first; a tap on the whole tile opens its form (no radio, no Continue). */
export const Choice: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('heading', { level: 1, name: 'Jak chcesz zacząć?' });
    await waitFor(() =>
      expect(tiles(canvas).map((tile) => tile.textContent)).toEqual([
        expect.stringMatching(/^Ręcznie/),
        expect.stringMatching(/^Z agentem/),
      ]),
    );
    await expect(canvas.queryByRole('radio')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /^Ręcznie/ }));
    await expect(
      await canvas.findByRole('button', { name: 'Wróć do sposobów rozpoczęcia' }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Agent' })).toBeNull();
  },
};

/** No agent can start: the tile is disabled and greyed out, with why, How to fix and Check again. */
export const ChoiceNoAgent: Story = {
  args: { providers: unavailableProviders },
  play: async ({ canvas, userEvent }) => {
    const tile = await canvas.findByRole('button', { name: /^Z agentem/ });
    await waitFor(() => expect(tile).toHaveAttribute('aria-disabled', 'true'));
    await expect(canvas.getByText(/^Żaden agent nie może wystartować: /)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Jak naprawić' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Sprawdź ponownie' })).toBeVisible();
    await userEvent.click(tile);
    await expect(canvas.getByRole('heading', { name: 'Jak chcesz zacząć?' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /^Ręcznie/ })).not.toHaveAttribute(
      'aria-disabled',
    );
  },
};

/** The agent form: today's form plus the Agent section (first step, the Run with agent picker). */
export const AgentForm: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /^Z agentem/ }));
    const section = within(
      (await canvas.findByRole('heading', { name: 'Agent' })).closest('section')!,
    );
    await expect(section.getByText('Zbieranie wymagań')).toBeVisible();
    await expect(await section.findByText('Nowa sesja')).toBeVisible();
    await expect(section.queryByText(/Wstępnie wybrane/)).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Utwórz i uruchom z agentem' })).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }), 'Limity');
    await expect(
      await canvas.findByText('Otworzy sesję agenta, gdy ten wystartuje.'),
    ).toBeVisible();
  },
};

/**
 * The chosen agent can start while the others cannot (dogfood 4): no warning about them under the
 * picker, their state stays in their tiles. The form says the work mode the agent's Session starts
 * in, as Run with agent does (Auto, when the provider runs it).
 */
const claudeWithAuto: ProviderDescriptor = {
  ...claudeDescriptor,
  providerModes: claudeDescriptor.providerModes?.map((mode) =>
    mode.modeId === 'auto' ? { ...mode, readiness: 'ready', reason: undefined } : mode,
  ),
};
export const AgentFormOtherAgentsUnavailable: Story = {
  args: { providers: [claudeWithAuto, codexNotFound(), antigravityTurnedOff] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /^Z agentem/ }));
    const section = within(
      (await canvas.findByRole('heading', { name: 'Agent' })).closest('section')!,
    );
    await expect(await section.findByText('Agent pracuje w trybie „Auto”.')).toBeVisible();
    await expect(section.queryByText(/^Niedostępne: /)).toBeNull();
    await expect(section.queryByRole('button', { name: 'Jak naprawić' })).toBeNull();
    // The other agents still say why, in their own tiles.
    await expect(section.getByRole('radio', { name: /Codex/ })).toBeInTheDocument();
  },
};

/** Create carries the intent: the stored request names the agent and the progress page takes over. */
export const AgentFormSendsTheIntent: Story = {
  args: { onProjectStarted: fn() },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /^Z agentem/ }));
    await canvas.findByText('Nowa sesja');
    await canvas.findByRole('radio', { name: 'Nowe środowisko pracy' });
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }), 'Limity');
    await userEvent.click(canvas.getByRole('button', { name: 'Utwórz i uruchom z agentem' }));
    await waitFor(() => expect(args.onProjectStarted).toHaveBeenCalled());
    const operationId = (args.onProjectStarted as ReturnType<typeof fn>).mock
      .calls[0]![0] as string;
    const stored = createSessionOperationStorage('unknown', sessionStorage).load(operationId);
    await expect(stored?.request.firstStep).toEqual(
      expect.objectContaining({ run: 'agent', provider: managedProviders[0]!.providerId }),
    );
  },
};

/** An owner-first archetype: one line, "Use Manually" switches to the manual form and keeps the draft. */
export const AgentFormOwnerFirstStep: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /^Z agentem/ }));
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Limity płatności',
    );
    const minimal = await canvas.findByRole('radio', {
      name: new RegExp(catalogue.archetypes[1]!.title),
    });
    await userEvent.click(minimal);
    await expect(await canvas.findByText('Pierwszy krok należy do Ciebie.')).toBeVisible();
    await expect(canvas.queryByText('Nowa sesja')).toBeNull();
    await expect(
      canvas.getByText('Pierwszy krok należy do Ciebie. Wybierz Ręcznie.'),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Wybierz Ręcznie' }));
    await expect(await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Limity płatności',
    );
    await expect(canvas.queryByRole('heading', { name: 'Agent' })).toBeNull();
    await expect(
      canvas.getByRole('radio', { name: new RegExp(catalogue.archetypes[1]!.title) }),
    ).toBeChecked();
  },
};

/** Back keeps the draft: the agent form's entries come back on the manual form, without the Agent section. */
export const BackKeepsTheDraft: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /^Z agentem/ }));
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Limity płatności',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do sposobów rozpoczęcia' }));
    await userEvent.click(await canvas.findByRole('button', { name: /^Ręcznie/ }));
    await expect(await canvas.findByRole('textbox', { name: 'Nazwa specyfikacji' })).toHaveValue(
      'Limity płatności',
    );
    await expect(canvas.queryByRole('heading', { name: 'Agent' })).toBeNull();
  },
};

/** For review and screenshots: the start screen with every agent available, nothing played. */
export const Screen: Story = { tags: ['!contract'] };
/** For review and screenshots: the start screen when no agent can start. */
export const ScreenNoAgent: Story = {
  tags: ['!contract'],
  args: { providers: unavailableProviders },
};
