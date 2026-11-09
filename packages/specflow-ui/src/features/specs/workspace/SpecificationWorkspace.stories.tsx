import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import type { ActivityEvent, SpecificationWorkspaceData } from '../read-model/model';
import { SpecificationWorkspace } from './SpecificationWorkspace';

type ProjectState = 'no-session' | 'with-session' | 'sessions-disabled';

const created: ActivityEvent = {
  id: 'specification-created',
  event: 'specification_created',
  kind: 'info',
  time: '2026-11-08',
  title: 'Specification created',
  description: '',
};

/**
 * A freshly created Specification as a project-mode Runtime reads it: the overview's description,
 * the registered documents, Tasks available and empty, partial activity, no Repository/Changes.
 */
function projectMode(state: ProjectState): SpecificationWorkspaceData {
  const base = createSpecificationWorkspaceFixture('empty', 'created-spec');
  const working = createSpecificationWorkspaceFixture('working', 'created-spec');
  const session = working.resumeSession!;
  const disabled = state === 'sessions-disabled';

  return {
    ...base,
    documents: working.documents.slice(0, 2),
    // The fixture's overview document is `spec`; the expand target follows the overview id, never position.
    overviewDocumentId: 'spec',
    sectionAvailability: {
      tasks: 'available',
      documents: 'available',
      sessions: disabled ? 'unavailable' : 'available',
      activity: 'available',
      repository: 'unavailable',
      changes: 'unavailable',
    },
    sectionUnavailableReason: {
      ...(disabled ? { sessions: 'source_unavailable' as const } : {}),
      repository: 'not_implemented',
      changes: 'not_implemented',
    },
    startSession: disabled
      ? { available: false, reason: 'sessions_disabled' }
      : { available: true },
    ...(state === 'with-session'
      ? {
          resumeSession: session,
          sessions: [session],
          activityEvents: [
            {
              id: 'session-started.' + session.id,
              event: 'session_started',
              kind: 'session',
              targetId: session.id,
              time: new Date(Date.now() - 2 * 3_600_000).toISOString(),
              title: session.title,
              description: 'Session started',
            },
            created,
          ],
        }
      : { activityEvents: [created] }),
  };
}

function Workspace({
  state,
  onNewSession,
}: {
  readonly state: ProjectState;
  readonly onNewSession?: () => void;
}) {
  const setup = useMemo(
    () => ({ query: createSpecFlowQueryClient(), services: createSpecFlowAppServices({}) }),
    [],
  );
  const data = useMemo(() => projectMode(state), [state]);

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
                    onNewSession={onNewSession}
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

const viewports = {
  w1440: { name: '1440', styles: { width: '1440px', height: '900px' }, type: 'desktop' },
} as const;

const meta = {
  title: 'SpecFlow/Screens/Specification Workspace',
  component: Workspace,
  parameters: { layout: 'fullscreen', viewport: { options: viewports } },
  globals: { viewport: { value: 'w1440', isRotated: false } },
  tags: ['contract'],
} satisfies Meta<typeof Workspace>;
export default meta;
type Story = StoryObj<typeof meta>;

function historyPanel(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll('h2')].find((heading) =>
    heading.textContent?.includes('Activity history'),
  );
}

async function expectNothingUnavailable(canvasElement: HTMLElement) {
  await expect(canvasElement.textContent).not.toContain('Not available on this server');
}

/**
 * Project mode, no Session yet: description, preparation block opening New Session, the inline
 * Tasks empty state and Documents. The created event alone keeps the history closed.
 */
export const ProjectModeNoSession: Story = {
  args: { state: 'no-session', onNewSession: fn() },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await canvas.findByText('No tasks yet');
    const tasks = canvasElement.querySelector('[data-empty-state]');
    await expect(tasks?.getAttribute('data-empty-state')).toBe('inline');
    await expect(canvasElement.querySelector('#tasks-heading')).not.toBeNull();
    await expect(canvas.getByText(/Utrzymać kontekst pracy/u)).toBeVisible();
    await expect(canvas.getByRole('heading', { name: /Documents/u })).toBeVisible();
    await expectNothingUnavailable(canvasElement);
    await expect(historyPanel(canvasElement)).toBeUndefined();

    await userEvent.click(canvas.getByRole('button', { name: 'Start session' }));
    await expect(args.onNewSession).toHaveBeenCalledTimes(1);

    // On demand the history shows the localized created event with its calendar date.
    await userEvent.click(canvas.getByRole('button', { name: 'Activity history' }));
    await expect(await canvas.findByText('Specification created')).toBeVisible();
    await expect(canvas.getByText('Nov 8, 2026')).toBeVisible();
  },
};

/** Project mode with a Session: Continue session instead of the block; the history opens. */
export const ProjectModeWithSession: Story = {
  // Without Requires attention (h2) or the preparation block (h2) the section headings are h3 under
  // the page h1: a known open item (see SpecificationSurface.stories PreparingTasks).
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
  args: { state: 'with-session' },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText('No tasks yet');
    await expect(canvasElement.querySelector('#resume-heading')).not.toBeNull();
    await expect(canvasElement.querySelector('#preparation-heading')).toBeNull();
    await expect(historyPanel(canvasElement)).toBeDefined();
    await expect(canvas.getByText('Session started')).toBeVisible();
    await expectNothingUnavailable(canvasElement);
  },
};

/** Project mode with Sessions turned off: the preparation path is explained, without a button. */
export const ProjectModeSessionsDisabled: Story = {
  args: { state: 'sessions-disabled' },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText('No tasks yet');
    await expect(canvas.getByText(/Sessions are turned off on this server\./u)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Start session' })).toBeNull();
    await expect(canvasElement.querySelector('#resume-heading')).toBeNull();
    await expectNothingUnavailable(canvasElement);
  },
};
