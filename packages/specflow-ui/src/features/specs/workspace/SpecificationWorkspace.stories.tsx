import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { SpecificationWorkspace } from './SpecificationWorkspace';

/** A project-mode Runtime that serves the manifest only: every other section is not implemented. */
function justCreated(): SpecificationWorkspaceData {
  const base = createSpecificationWorkspaceFixture('empty', 'created-spec');
  const sections = ['tasks', 'documents', 'sessions', 'activity', 'repository', 'changes'] as const;
  return {
    ...base,
    sectionAvailability: Object.fromEntries(sections.map((id) => [id, 'unavailable'])),
    sectionUnavailableReason: Object.fromEntries(sections.map((id) => [id, 'not_implemented'])),
  };
}

function Workspace({ demo }: { readonly demo: boolean }) {
  const setup = useMemo(
    () => ({ query: createSpecFlowQueryClient(), services: createSpecFlowAppServices({}) }),
    [],
  );
  const data = useMemo(
    () => (demo ? createSpecificationWorkspaceFixture('empty', 'created-spec') : justCreated()),
    [demo],
  );
  return (
    <QueryClientProvider client={setup.query}>
      <TestServicesRouterContext services={setup.services}>
        <StoryLocalization locale="en">
          <AppWorkspaceProvider>
            <UiModulesProvider modules={builtInUiModuleRegistry}>
              <div className="h-dvh">
                <AppShell navigation={<div>Specification navigation</div>}>
                  <SpecificationWorkspace
                    specId="created-spec"
                    data={data}
                    {...(demo ? { onNewConversation: () => undefined } : {})}
                  />
                </AppShell>
              </div>
            </UiModulesProvider>
          </AppWorkspaceProvider>
        </StoryLocalization>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'SpecFlow/Features/Specification/Overview after Create',
  component: Workspace,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Workspace>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Project mode: calm "not available yet" state and no action that cannot work. */
export const ProjectModeNotAvailableYet: Story = {
  args: { demo: false },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await canvas.findAllByText('Not available in this Runtime');
    await expect(canvas.queryByRole('button', { name: 'Start conversation' })).toBeNull();
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(canvas.queryByText("Couldn't load history")).toBeNull();
  },
};

/** Demo mode is unchanged: the preparation call-to-action starts a conversation. */
export const DemoModeKeepsConversation: Story = {
  args: { demo: true },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Start conversation' })).toBeEnabled();
  },
};
