import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { settleViewport } from '../../../test-support/viewportSettle.stories-support';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
import { catalogue } from './options/creationCatalogue.stories-support';
import {
  createOptionsWireFixture,
  workspaceApiFixture,
} from './options/creationOptions.stories-support';

function FirstRunForm() {
  const client = useMemo(createSpecFlowQueryClient, []);
  const services = useMemo(
    () =>
      createSpecFlowAppServices({
        runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
        workspaceApi: workspaceApiFixture('git-disabled'),
        projectCreationApi: {
          ...createSpecFlowAppServices().projectCreationApi,
          archetypes: () => Promise.resolve({ ...catalogue, archetypes: [] }),
          createOptions: () => Promise.resolve(createOptionsWireFixture('git-disabled')),
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('pl')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div />}>
                <CreateSpecificationScreen
                  onProjectStarted={() => undefined}
                  onCreated={() => undefined}
                  onSession={() => undefined}
                  onBack={() => undefined}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'SpecFlow/Screens/Create Specification',
  component: FirstRunForm,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FirstRunForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MissingDefinitionsNarrow: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const width of [320, 390, 834, 1440]) {
      await settleViewport(width, 844);
      const manual = canvas.queryByRole('button', { name: /^Ręcznie/ });
      if (manual) {
        manual.click();
      }

      const footer = await canvas.findByRole('group', { name: 'Utworzenie specyfikacji' });
      await canvas.findByRole('textbox', { name: 'Archetyp' });
      await expect(canvas.getByText('Projekt nie ma dostępnych archetypów.')).toBeVisible();
      await expect(footer.textContent).not.toContain('archetyp');
      const submit = within(footer).getByRole('button', { name: 'Utwórz specyfikację' });
      await expect(submit).toHaveAttribute('aria-disabled', 'true');
      await expect(footer.getBoundingClientRect().height).toBeLessThan(180);
      await expect(submit.getBoundingClientRect().right).toBeLessThanOrEqual(width);
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    }

    await settleViewport();
  },
};
