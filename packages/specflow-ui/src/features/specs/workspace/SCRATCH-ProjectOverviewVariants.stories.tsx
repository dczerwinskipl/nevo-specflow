/**
 * SCRATCH - throwaway visual variants for docs/ideas/specflow-runtime/project-mode-spec-overview.
 * Not product code, not a contract story. Delete after the owner decides.
 */
import { useMemo, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  AppContent,
  AppContentContainer,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import {
  builtInUiModuleRegistry,
  createSpecFlowUiRegistry,
} from '../../../app/ui-modules/builtInUiModules';
import { contributeTo, type UiModule } from '../../../app/ui-modules/contracts';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import {
  createSpecificationWorkspaceFixture,
  defaultSessions,
} from '../../../../test-support/specs/workspace/fixtures';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { specificationWorkSections } from '../extensions/specificationWorkSections';
import { gitUiModule } from '../../git/uiModule';
import { sessionsUiModule } from '../../sessions/uiModule';
import { documentsUiModule } from '../../documents/uiModule';
import { WorkspaceSection } from '../../../shared/workspace-section';
import { SpecificationWorkspace } from './SpecificationWorkspace';
import { WorkView } from './WorkView';
import { WorkspaceProvider, createFakeWorkspaceRuntime } from './WorkspaceContext';
import { PreparationSection } from './sections';

type TasksVariant = 'line' | 'hidden';

function scratchModules(tasks: TasksVariant): UiModule {
  return {
    id: 'scratch.project-overview',
    contributions: [
      // Proposal: the preparation call-to-action whenever there are no Tasks and no Session to resume.
      contributeTo(specificationWorkSections, {
        id: 'scratch.preparation',
        slot: 'context',
        isVisible: ({ data }) => !data.resumeSession && (data.totalTasksCount ?? 0) === 0,
        Component: () => <PreparationSection />,
      }),
      ...(tasks === 'line'
        ? [
            contributeTo(specificationWorkSections, {
              id: 'scratch.tasks-empty',
              slot: 'main',
              Component: () => (
                <WorkspaceSection aria-labelledby="tasks-heading">
                  <WorkspaceSection.Header id="tasks-heading" title="Zadania" icon="list-checks" />
                  <Typography variant="body-sm" className="text-content-secondary">
                    Nie ma jeszcze zadań. Pojawią się tutaj, gdy specyfikacja zostanie przygotowana
                    do realizacji.
                  </Typography>
                </WorkspaceSection>
              ),
            }),
          ]
        : []),
    ],
  };
}

function projectData(withSession: boolean): SpecificationWorkspaceData {
  const base = createSpecificationWorkspaceFixture('working', 'sso-login');
  const session = {
    ...defaultSessions[0]!,
    id: 's1',
    title: 'Przygotowanie wymagań SSO',
    taskCount: undefined,
    age: '2 godz. temu',
    activity: undefined,
    activityCode: undefined,
    meta: undefined,
    navigationStatus: 'quiet' as const,
  };

  return {
    ...base,
    title: 'Logowanie SSO',
    intro:
      'Logowanie przez firmowego dostawcę tożsamości (OIDC) z automatycznym założeniem konta przy pierwszym logowaniu.',
    // Scratch bypass of today's isEmpty gating; the proposal decouples these rules from Tasks.
    isEmpty: false,
    isPreparing: false,
    hasGit: false,
    repoContext: undefined,
    changes: undefined,
    attentionItems: [],
    featureAttention: {
      tasks: { state: 'available', items: [] },
      sessions: { state: 'available', items: [] },
      git: { state: 'unavailable', reason: 'not_implemented' },
    },
    taskGroups: [],
    completedTasksCount: 0,
    totalTasksCount: 0,
    documents: [
      { id: 'overview', title: 'Logowanie SSO', kind: 'Przegląd', filename: 'overview.md' },
      { id: 'requirements', title: 'Wymagania', kind: 'Wymagania', filename: 'requirements.md' },
    ],
    mainDocumentId: undefined,
    sessions: withSession ? [session] : [],
    resumeSession: withSession ? session : undefined,
    startSession: { available: true },
    sectionAvailability: {
      tasks: 'available',
      documents: 'available',
      sessions: 'available',
      activity: 'available',
      repository: 'unavailable',
      changes: 'unavailable',
    },
    sectionUnavailableReason: { repository: 'not_implemented', changes: 'not_implemented' },
    activityEvents: [
      ...(withSession
        ? [
            {
              id: 'a2',
              kind: 'session' as const,
              targetId: 's1',
              title: 'Przygotowanie wymagań SSO',
              description: 'Rozpoczęto sesję',
              time: '2 godz. temu',
            },
          ]
        : []),
      {
        id: 'a1',
        kind: 'info' as const,
        title: 'Utworzono specyfikację',
        description: '',
        time: '8 lis 2026',
      },
    ],
    executionReadiness: { canExecute: false, reasonCode: 'not_implemented', blockers: [] },
  };
}

/** Today's project-mode response: Tasks and activity not implemented, manifest without Tasks. */
function currentData(): SpecificationWorkspaceData {
  const data = projectData(true);

  return {
    ...data,
    intro: '',
    isEmpty: true,
    sectionAvailability: {
      ...data.sectionAvailability,
      tasks: 'unavailable',
      activity: 'unavailable',
    },
    sectionUnavailableReason: {
      ...data.sectionUnavailableReason,
      tasks: 'not_implemented',
      activity: 'not_implemented',
    },
    activityEvents: [],
  };
}

function Frame({ children }: { readonly children: ReactNode }) {
  const setup = useMemo(
    () => ({ query: createSpecFlowQueryClient(), services: createSpecFlowAppServices({}) }),
    [],
  );

  return (
    <QueryClientProvider client={setup.query}>
      <TestServicesRouterContext services={setup.services}>
        <StoryLocalization locale="pl">
          <AppWorkspaceProvider>
            <div className="h-dvh">
              <AppShell navigation={<div className="p-4 text-body-sm">Nawigacja specyfikacji</div>}>
                {children}
              </AppShell>
            </div>
          </AppWorkspaceProvider>
        </StoryLocalization>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
}

interface Args {
  readonly scenario: 'current' | 'proposal' | 'no-activity-panel';
  readonly withSession: boolean;
  readonly tasks: TasksVariant;
}

function Variant({ scenario, withSession, tasks }: Args) {
  const registry = useMemo(
    () =>
      scenario === 'current'
        ? builtInUiModuleRegistry
        : createSpecFlowUiRegistry([
            gitUiModule,
            sessionsUiModule,
            scratchModules(tasks),
            documentsUiModule,
          ]),
    [scenario, tasks],
  );
  const data = useMemo(
    () => (scenario === 'current' ? currentData() : projectData(withSession)),
    [scenario, withSession],
  );
  const runtime = useMemo(() => createFakeWorkspaceRuntime(), []);

  return (
    <Frame>
      <UiModulesProvider modules={registry}>
        {scenario === 'no-activity-panel' ? (
          <WorkspaceProvider runtime={runtime}>
            <AppWorkspace
              split="primary"
              fit="bounded"
              labels={{
                backToPrimary: 'Wstecz',
                closeSecondary: 'Zamknij',
                openNavigation: 'Menu',
              }}
            >
              <AppWorkspace.Primary
                header={<WorkspaceHeader title="Przegląd" as="span" icon="file" />}
              >
                <AppContent className="w-content-standard max-w-full">
                  <AppWorkspaceBody scroll="area" contentClassName="py-6">
                    <AppContentContainer align="start" size="full" className="grid gap-6">
                      <WorkView specId="sso-login" data={data} />
                    </AppContentContainer>
                  </AppWorkspaceBody>
                </AppContent>
              </AppWorkspace.Primary>
            </AppWorkspace>
          </WorkspaceProvider>
        ) : (
          <SpecificationWorkspace
            specId="sso-login"
            data={data}
            onNewConversation={scenario === 'current' ? undefined : () => undefined}
            onOpenSession={() => undefined}
            onNewSession={() => undefined}
          />
        )}
      </UiModulesProvider>
    </Frame>
  );
}

const meta = {
  title: 'Scratch/Project Overview Variants',
  component: Variant,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Variant>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Current: Story = { args: { scenario: 'current', withSession: true, tasks: 'line' } };
export const A1NoSessionTasksLine: Story = {
  args: { scenario: 'proposal', withSession: false, tasks: 'line' },
};
export const B1NoSessionTasksHidden: Story = {
  args: { scenario: 'proposal', withSession: false, tasks: 'hidden' },
};
export const A2SessionTasksLine: Story = {
  args: { scenario: 'proposal', withSession: true, tasks: 'line' },
};
export const B2SessionNoActivityPanel: Story = {
  args: { scenario: 'no-activity-panel', withSession: true, tasks: 'line' },
};
