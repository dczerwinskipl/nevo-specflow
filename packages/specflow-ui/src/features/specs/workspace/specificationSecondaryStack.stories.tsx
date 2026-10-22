import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  AppContent,
  AppWorkspaceBody,
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  useSecondaryNavigation,
  Button,
} from '@nevo/ui';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import { SpecificationSecondaryDataContext, taskPreviewStack } from './specificationSecondaryStack';

function PendingPreviewInner() {
  const nav = useSecondaryNavigation();
  const data = useMemo(
    () => ({ ...createSpecificationWorkspaceFixture('working', 'spec'), taskGroups: [] }),
    [],
  );
  return (
    <SpecificationSecondaryDataContext.Provider
      value={{ specId: 'spec', data, openFullTask: () => undefined, previewTask: () => undefined }}
    >
      <div className="h-dvh">
        <AppShell navigation={<div>Specification navigation</div>}>
          <AppWorkspace split="primary">
            <AppWorkspace.Primary header={<WorkspaceHeader title="Specification" />}>
              <AppContent className="w-content-xwide max-w-full">
                <AppWorkspaceBody scroll="area">
                  <div className="p-4">
                    <p>Parent remains readable</p>
                    <Button
                      onClick={() =>
                        void nav.open(taskPreviewStack, { specId: 'spec', taskId: 'unknown-task' })
                      }
                    >
                      Open Task Preview
                    </Button>
                  </div>
                </AppWorkspaceBody>
              </AppContent>
            </AppWorkspace.Primary>
          </AppWorkspace>
        </AppShell>
      </div>
    </SpecificationSecondaryDataContext.Provider>
  );
}
function PendingPreview() {
  const setup = useMemo(
    () => ({
      query: createSpecFlowQueryClient(),
      services: createSpecFlowAppServices({
        taskApi: { getTask: () => new Promise(() => undefined) },
      }),
    }),
    [],
  );
  return (
    <QueryClientProvider client={setup.query}>
      <TestServicesRouterContext services={setup.services}>
        <StoryLocalization locale="en">
          <AppWorkspaceProvider>
            <PendingPreviewInner />
          </AppWorkspaceProvider>
        </StoryLocalization>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}
const meta = {
  title: 'SpecFlow/Features/Specification/Pending Task Preview',
  component: PendingPreview,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PendingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {
  tags: ['contract'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open Task Preview' }));
    await canvas.findByRole('status', { name: 'Loading Task…' });
    await expect(canvas.queryByText('Loading…')).toBeNull();
    await expect(canvasElement.querySelectorAll('[data-loading-shape="preview"]')).toHaveLength(1);
    const panel = canvasElement.querySelector(
      '[data-workspace-surface="secondary"][data-workspace-active="true"]',
    )!;
    await expect(panel.getBoundingClientRect().width).toBeGreaterThan(200);
    await userEvent.click(canvas.getByRole('button', { name: 'Close secondary content' }));
    await expect(canvas.getByText('Parent remains readable')).toBeVisible();
  },
};
export const Inspect: Story = {};
