import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { associationContext } from '../../associations/associationContext';
import {
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  WorkspaceHeader,
  defineSecondaryStack,
} from '@nevo/ui';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionContext } from './SessionContext';
import { SessionContextSourceProvider } from './sessionContextValue';
import {
  associationsUnreadableContext,
  attentionUnreadableContext,
  batchContext,
  batchPartialMissingContext,
  executorMissingContext,
  genericSpecLevelContext,
  realRouteContext,
  realRouteLoadingContext,
  relatedTasksUnreadableContext,
  settledTurnContext,
  singleTaskContext,
  specLoadingContext,
  specRequiredMissingContext,
  specUnreadableContext,
  standaloneContext,
  stressContext,
  taskRequiredMissingContext,
  terminalOutcomeContext,
} from './sessionContextFixtures';
import type { SessionContextViewModel } from './sessionContextTypes';

/**
 * Isolated catalog entry for the Context panel (no `ManagedSession` composition — that screen is
 * under separate, parallel edit): visual verification for the live-review fixes —
 * - Related Tasks lists one row per associated Task (session-association-ux §7), built from the
 *   shared `ContextNavigationRow` geometry;
 * - consistent `Typography` tokens across every section instead of ad hoc `text-*`/`font-*`
 *   classes;
 * - `SessionTelemetrySection`'s new hierarchy — compact stat cells for cost/tokens, the
 *   collapsed token-breakdown disclosure, and "Zużycie sesji"/"Limity dostawcy" as two visually
 *   separate sections, the rate-limit windows as full-width stacked rows;
 * - the Planned areas section (`ContextPlannedAreasSection`): one real, clickable, navigable
 *   `ContextNavigationRow` per remaining root-tab subject.
 *
 * Mounted through the real `AppWorkspace`/`AppWorkspaceProvider` runtime `SessionContext` itself
 * depends on (`useSecondaryNavigation`) — deliberately not through `ManagedSession` itself, which
 * is under separate, parallel edit. `fit="available" split="dynamic"` (mirroring
 * `WorkInspector.stories.tsx`'s own harness) is required for an `openTab()`-opened tab (Tasks, or
 * any of the five planned areas) to actually render at a usable width instead of the fixed
 * `split="primary"` 75/25 preset's cramped Secondary share — this is the one thing this harness
 * changes beyond `SessionContext.test.tsx`'s minimal mount, so clicking a navigation row is
 * genuinely visually verifiable here, not just functionally wired.
 */
const sessionId = '00000000-0000-4000-8000-000000000001';

/** Stand-in for `createWorkInspector`'s per-Turn Work stack (this harness has no Sessions API):
 * one tab per Turn, so the "Work history" row is real and clickable here. */
const storyWorkStack = defineSecondaryStack<
  { sessionId: string; turnId: string },
  { sessionId: string; turnId: string },
  { work: object }
>({
  id: 'managed-session-work',
  initial: 'work',
  instanceId: (params) => params.turnId,
  tabLabel: () => 'Work history',
  useData: (params) => ({ status: 'ready', data: params }),
  screens: { work: { title: 'Work history', component: () => <div className="p-4">Work</div> } },
});

function ContextHost({ value }: { value: SessionContextViewModel }) {
  return (
    <StoryLocalization locale="en">
      <AppWorkspaceProvider>
        <SessionContextSourceProvider
          sessionId={sessionId}
          value={value}
          workStack={storyWorkStack}
        >
          <AppShell navigation={<div className="p-4">SpecFlow</div>}>
            <AppWorkspace fit="available" split="dynamic">
              <AppWorkspace.Primary header={<WorkspaceHeader title="Session" />}>
                {/* `onOpenSpecification` here is a story-only stand-in for the real
                  `useNavigate({ to: '/specs/$specId' })` call (see `SessionContext.tsx`'s own
                  prop doc) — this harness has no Router mounted (same as `SessionContext.test.tsx`
                  and every other story here), so it just logs instead of navigating. Exercises the
                  row's real click wiring and the real `value.specification` data without that
                  dependency. */}
                {/* In the product Context always sits under the Secondary's level-2 heading; its
                    sections are level 3, so the harness keeps that outline. */}
                <h2 className="sr-only">Context</h2>
                <SessionContext
                  sessionId={sessionId}
                  value={value}
                  onOpenSpecification={(specification) =>
                    console.info('Open Specification', specification)
                  }
                  onOpenDocuments={(specification) => console.info('Open Documents', specification)}
                  workStack={storyWorkStack}
                />
              </AppWorkspace.Primary>
            </AppWorkspace>
          </AppShell>
        </SessionContextSourceProvider>
      </AppWorkspaceProvider>
    </StoryLocalization>
  );
}

/**
 * Context mounted the way `ManagedSession` mounts it: the default split-capable Secondary next to a
 * Primary, with the same `fit="available" split="dynamic"` workspace. At a 1280 px viewport the
 * Secondary resolves to ~330 px, the narrow width the Context layout is tuned for; the splitter
 * can be dragged to check a wider Secondary. Locale is Polish because the Polish copy is the
 * longest of the shipped locales.
 */
function SecondaryContextHost({ value }: { value: SessionContextViewModel }) {
  return (
    <StoryLocalization locale="pl">
      <AppWorkspaceProvider>
        <SessionContextSourceProvider
          sessionId={sessionId}
          value={value}
          workStack={storyWorkStack}
        >
          <AppShell navigation={<div className="p-4">SpecFlow</div>}>
            <AppWorkspace fit="available" split="dynamic">
              <AppWorkspace.Primary header={<WorkspaceHeader title="Session" />}>
                <div className="p-4" />
              </AppWorkspace.Primary>
              <AppWorkspace.Secondary
                header={<WorkspaceHeader title="Kontekst" headingLevel={2} />}
              >
                <SessionContext
                  sessionId={sessionId}
                  value={value}
                  onOpenSpecification={(specification) =>
                    console.info('Open Specification', specification)
                  }
                  onOpenDocuments={(specification) => console.info('Open Documents', specification)}
                  workStack={storyWorkStack}
                />
              </AppWorkspace.Secondary>
            </AppWorkspace>
          </AppShell>
        </SessionContextSourceProvider>
      </AppWorkspaceProvider>
    </StoryLocalization>
  );
}

const meta = {
  title: 'SpecFlow/Components/Session Context',
  component: ContextHost,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ContextHost>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The representative Context panel: pick the Session's context fixture. */
export const Default: Story = {
  args: { value: genericSpecLevelContext() },
  argTypes: {
    value: {
      name: 'context',
      control: 'select',
      options: [
        'relatedTasks',
        'singleTask',
        'batch',
        'stale',
        'stress',
        'settledTurn',
        'realRoute',
        'realRouteLoading',
        'associationsUnreadable',
        'standalone',
        'specLoading',
        'specUnreadable',
        'specRequiredMissing',
        'taskRequiredMissing',
        'batchPartialMissing',
        'attentionUnreadable',
        'relatedTasksUnreadable',
        'executorMissing',
      ],
      mapping: {
        relatedTasks: genericSpecLevelContext(),
        singleTask: singleTaskContext(),
        batch: batchContext(),
        stale: terminalOutcomeContext(),
        stress: stressContext(),
        settledTurn: settledTurnContext(),
        realRoute: realRouteContext(),
        realRouteLoading: realRouteLoadingContext(),
        associationsUnreadable: associationsUnreadableContext(),
        standalone: standaloneContext(),
        specLoading: specLoadingContext(),
        specUnreadable: specUnreadableContext(),
        specRequiredMissing: specRequiredMissingContext(),
        taskRequiredMissing: taskRequiredMissingContext(),
        batchPartialMissing: batchPartialMissingContext(),
        attentionUnreadable: attentionUnreadableContext(),
        relatedTasksUnreadable: relatedTasksUnreadableContext(),
        executorMissing: executorMissingContext(),
      },
    },
  },
};

/** Two related Tasks: one row each (title, key), each opening that Task's own tab. Full telemetry
 * snapshot exercises every
 * `Progress` bar (context occupancy + both rate-limit windows), all comfortably under the
 * attention/danger thresholds. */
export const GenericWithRelatedTasks: Story = {
  tags: ['contract'],
  args: { value: genericSpecLevelContext() },
};

/** Exactly one related Task: its one row opens that Task's own tab. Partial telemetry: cost stays
 * absent rather than a fake `$0`. */
export const SingleRelatedTask: Story = {
  tags: ['contract'],
  args: { value: singleTaskContext() },
};

/** Batch execution scope: several "current execution" Task rows, each a `ContextNavigationRow`
 * (icon, title + key, centred chevron) instead of the old stacked-text `Button`. */
export const BatchExecution: Story = {
  tags: ['contract'],
  args: { value: batchContext() },
};

/** Stale telemetry: every `Progress` bar and sentence carries the muted "Stale" cue. Also the
 * fixture whose rate-limit window crosses the danger threshold (390k/400k ≈ 98%). */
export const StaleTelemetry: Story = {
  tags: ['contract'],
  args: { value: terminalOutcomeContext() },
};

/** Stress fixture: long Task/Specification titles, a longer related-Task list (3), mixed
 * Attention tones — the responsive/typography regression check for Parts 1–2. */
export const Stress: Story = {
  tags: ['contract'],
  args: { value: stressContext() },
};

/** Mobile (375px): the same generic fixture, confirming the collapsed Related Tasks row, the
 * rebuilt telemetry hierarchy (stat cells, collapsed token breakdown, separated provider-limits
 * row), and the navigation skeleton below it all still read cleanly in the narrow Context flow. */
export const MobileGenericWithRelatedTasks: Story = {
  tags: ['contract'],
  args: { value: genericSpecLevelContext() },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** Generic fixture in the real ~330 px Secondary (1280 px viewport): navigation rows, Session
 * usage metrics and the three progress bars at the narrow width they are tuned for. */
export const InSecondary: Story = {
  tags: ['contract'],
  args: { value: genericSpecLevelContext() },
  render: (args) => <SecondaryContextHost {...args} />,
};

/** The same Session after its last Turn settled (no running Turn, Session still ready for the
 * next message): the context window is captioned "Ostatnia tura", not "Bieżąca tura". */
export const InSecondarySettledTurn: Story = {
  tags: ['contract'],
  args: { value: settledTurnContext() },
  render: (args) => <SecondaryContextHost {...args} />,
};

/** Stress fixture in the ~330 px Secondary: long Specification/Task titles stay one truncated line
 * (the height of their loading skeleton) above their key, the chevron centred on the two-line row,
 * and stale/danger telemetry. */
export const InSecondaryStress: Story = {
  tags: ['contract'],
  args: { value: stressContext() },
  render: (args) => <SecondaryContextHost {...args} />,
};

/** Batch execution in the ~330 px Secondary: several two-line Task rows (key + note). */
export const InSecondaryBatch: Story = {
  tags: ['contract'],
  args: { value: batchContext() },
  render: (args) => <SecondaryContextHost {...args} />,
};

/** A Session with no Specification association: executor, Work and Planned areas only, and no
 * scope note (nothing is promised, so nothing is explained). */
export const Standalone: Story = {
  tags: ['contract'],
  args: { value: standaloneContext() },
};

/** The Specification-scoped Session with the Documents row under its Specification row. */
export const WithDocuments: Story = {
  tags: ['contract'],
  args: { value: genericSpecLevelContext() },
  render: (args) => <SecondaryContextHost {...args} />,
};

/** Specification still loading: its label with skeleton rows (identity + Documents). */
export const SpecificationLoading: Story = {
  tags: ['contract'],
  args: { value: specLoadingContext() },
};

/** The Specification exists but could not be read: a warning note in its slot. */
export const SpecificationUnreadable: Story = {
  tags: ['contract'],
  args: { value: specUnreadableContext() },
};

/** A Task-scoped Session whose required Task cannot be found: an error note. */
export const TaskRequiredMissing: Story = {
  tags: ['contract'],
  args: { value: taskRequiredMissingContext() },
};

/** One of three Tasks missing: the two found Tasks render beside the error note. */
export const BatchPartialMissing: Story = {
  tags: ['contract'],
  args: { value: batchPartialMissingContext() },
};

export const AttentionUnreadable: Story = {
  tags: ['contract'],
  args: { value: attentionUnreadableContext() },
};

export const RelatedTasksUnreadable: Story = {
  tags: ['contract'],
  args: { value: relatedTasksUnreadableContext() },
};

export const ExecutorMissing: Story = {
  tags: ['contract'],
  args: { value: executorMissingContext() },
};

const settleWide = () => settleViewport(1280, 800);
const settleNarrow = () => settleViewport(390, 844);
const mobile = { viewport: { value: 'mobile1', isRotated: false } };

/** The real route today in the ~330 px Secondary: executor, the scope-unknown note, Work, Planned
 * areas. */
export const RealRouteInSecondary: Story = {
  tags: ['contract'],
  args: { value: realRouteContext() },
  render: (args) => <SecondaryContextHost {...args} />,
  play: settleWide,
};
export const RealRouteMobile: Story = {
  tags: ['contract'],
  args: { value: realRouteContext() },
  globals: mobile,
  play: settleNarrow,
};

export const RequiredMissingInSecondary: Story = {
  tags: ['contract'],
  args: { value: specRequiredMissingContext() },
  render: (args) => <SecondaryContextHost {...args} />,
  play: settleWide,
};
export const RequiredMissingMobile: Story = {
  tags: ['contract'],
  args: { value: specRequiredMissingContext() },
  globals: mobile,
  play: settleNarrow,
};

export const LoadingInSecondary: Story = {
  tags: ['contract'],
  args: { value: { ...specLoadingContext(), attention: { status: 'loading' } } },
  render: (args) => <SecondaryContextHost {...args} />,
  play: settleWide,
};
export const LoadingMobile: Story = {
  tags: ['contract'],
  args: { value: realRouteLoadingContext() },
  globals: mobile,
  play: settleNarrow,
};

export const AssociationsUnreadableInSecondary: Story = {
  tags: ['contract'],
  args: { value: associationsUnreadableContext() },
  render: (args) => <SecondaryContextHost {...args} />,
  play: settleWide,
};
export const AssociationsUnreadableMobile: Story = {
  tags: ['contract'],
  args: { value: associationsUnreadableContext() },
  globals: mobile,
  play: settleNarrow,
};

type SpecificationAssociation = Extract<
  SessionAssociationRead['association'],
  { kind: 'specification' }
>;

/** The Context of an associated Session, mapped from its association read as the route maps it. */
function associated(
  specification: SpecificationAssociation['specification'],
  tasks: SpecificationAssociation['tasks'] = [],
): SessionContextViewModel {
  return {
    ...associationContext({
      status: 'success',
      data: { sessionId, association: { kind: 'specification', specification, tasks } },
    }),
    executor: realRouteContext().executor,
  };
}

const authSpecification = {
  state: 'available',
  value: { specId: 'auth', key: 'SPEC-7', title: 'Logowanie SSO', collection: 'current' },
} as const;

/** A viewer without `spec.view` at the Specification: an info note, no Documents row, no Tasks. */
export const AssociationForbiddenInSecondary: Story = {
  tags: ['contract'],
  args: { value: associated({ state: 'forbidden' }) },
  render: (args) => <SecondaryContextHost {...args} />,
  play: async ({ canvas }) => {
    await settleWide();
    await expect(
      canvas.getByText('Nie masz uprawnień do wyświetlenia specyfikacji powiązanej z tą sesją.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Dokumenty' })).toBeNull();
    await expect(canvas.queryByText('Powiązane zadania')).toBeNull();
  },
};

/** An archived Specification: its row says so; its links carry the archive collection. */
export const AssociationArchivedInSecondary: Story = {
  tags: ['contract'],
  args: {
    value: associated({
      ...authSpecification,
      value: { ...authSpecification.value, collection: 'archived' },
    }),
  },
  render: (args) => <SecondaryContextHost {...args} />,
  play: async ({ canvas }) => {
    await settleWide();
    await expect(canvas.getByRole('button', { name: /Logowanie SSO.*W archiwum/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Dokumenty' })).toBeVisible();
  },
};

/** One of two associated Tasks removed: the found one, a count of the missing, and never Current
 * execution or Attention (an association is context, not execution). */
export const AssociationTasksPartlyMissingInSecondary: Story = {
  tags: ['contract'],
  args: {
    value: associated(authSpecification, [
      { state: 'available', value: { taskId: 'task-01', key: 'TASK-01', title: 'Logowanie' } },
      { state: 'missing', id: 'task-02' },
    ]),
  },
  render: (args) => <SecondaryContextHost {...args} />,
  play: async ({ canvas }) => {
    await settleWide();
    await expect(canvas.getByText('Powiązane zadania')).toBeVisible();
    await expect(canvas.getByText('Nie znaleziono 1 z 2 powiązanych zadań.')).toBeVisible();
    await expect(canvas.queryByText('Aktualne wykonanie')).toBeNull();
    await expect(canvas.queryByText('Uwaga / dalsze działania')).toBeNull();
  },
};

/** The associated Specification was removed: one danger note naming its id, no Tasks section. */
export const AssociationSpecificationMissingMobile: Story = {
  tags: ['contract'],
  args: { value: associated({ state: 'missing', id: 'auth' }, [{ state: 'missing', id: 't1' }]) },
  globals: mobile,
  play: async ({ canvas }) => {
    await settleNarrow();
    await expect(
      canvas.getByText('Can’t find specification auth associated with this session.'),
    ).toBeVisible();
    await expect(canvas.queryByText('Related Tasks')).toBeNull();
  },
};
