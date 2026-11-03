import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell, AppWorkspace, AppWorkspaceProvider, WorkspaceHeader } from '@nevo/ui';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionContext } from './SessionContext';
import {
  batchContext,
  emptyContext,
  genericSpecLevelContext,
  settledTurnContext,
  singleTaskContext,
  stressContext,
  terminalOutcomeContext,
} from './sessionContextFixtures';
import type { SessionContextViewModel } from './sessionContextTypes';

/**
 * Isolated catalog entry for the Context panel (no `ManagedSession` composition — that screen is
 * under separate, parallel edit): visual verification for the live-review fixes —
 * - Related Tasks collapses to one navigational summary row (icon + count + chevron), never the
 *   individual Task list, built from the shared `ContextNavigationRow` geometry;
 * - consistent `Typography` tokens across every section instead of ad hoc `text-*`/`font-*`
 *   classes;
 * - `SessionTelemetrySection`'s new hierarchy — compact stat cells for cost/tokens, the
 *   collapsed token-breakdown disclosure, and "Zużycie sesji"/"Limity dostawcy" as two visually
 *   separate sections, the rate-limit windows as full-width stacked rows;
 * - the §7.4 navigation skeleton (`OtherAreasSection`): one real, clickable, navigable
 *   `ContextNavigationRow` per remaining root-tab subject.
 *
 * Mounted through the real `AppWorkspace`/`AppWorkspaceProvider` runtime `SessionContext` itself
 * depends on (`useSecondaryNavigation`) — deliberately not through `ManagedSession` itself, which
 * is under separate, parallel edit. `fit="available" split="dynamic"` (mirroring
 * `WorkInspector.stories.tsx`'s own harness) is required for an `openTab()`-opened tab (Tasks, or
 * any of the six placeholder subjects) to actually render at a usable width instead of the fixed
 * `split="primary"` 75/25 preset's cramped Secondary share — this is the one thing this harness
 * changes beyond `SessionContext.test.tsx`'s minimal mount, so clicking a navigation row is
 * genuinely visually verifiable here, not just functionally wired.
 */
const sessionId = '00000000-0000-4000-8000-000000000001';

function ContextHost({ value }: { value: SessionContextViewModel }) {
  return (
    <StoryLocalization locale="en">
      <AppWorkspaceProvider>
        <AppShell navigation={<div className="p-4">SpecFlow</div>}>
          <AppWorkspace fit="available" split="dynamic">
            <AppWorkspace.Primary header={<WorkspaceHeader title="Session" />}>
              {/* `onOpenSpecification` here is a story-only stand-in for the real
                  `useNavigate({ to: '/specs/$specId' })` call (see `SessionContext.tsx`'s own
                  prop doc) — this harness has no Router mounted (same as `SessionContext.test.tsx`
                  and every other story here), so it just logs instead of navigating. Exercises the
                  row's real click wiring and the real `value.specification` data without that
                  dependency. */}
              <SessionContext
                sessionId={sessionId}
                value={value}
                onOpenSpecification={(specification) =>
                  console.info('Open Specification', specification)
                }
              />
            </AppWorkspace.Primary>
          </AppWorkspace>
        </AppShell>
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
        <AppShell navigation={<div className="p-4">SpecFlow</div>}>
          <AppWorkspace fit="available" split="dynamic">
            <AppWorkspace.Primary header={<WorkspaceHeader title="Session" />}>
              <div className="p-4" />
            </AppWorkspace.Primary>
            <AppWorkspace.Secondary header={<WorkspaceHeader title="Kontekst" />}>
              <SessionContext
                sessionId={sessionId}
                value={value}
                onOpenSpecification={(specification) =>
                  console.info('Open Specification', specification)
                }
              />
            </AppWorkspace.Secondary>
          </AppWorkspace>
        </AppShell>
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
      options: ['relatedTasks', 'singleTask', 'batch', 'stale', 'stress', 'settledTurn', 'empty'],
      mapping: {
        relatedTasks: genericSpecLevelContext(),
        singleTask: singleTaskContext(),
        batch: batchContext(),
        stale: terminalOutcomeContext(),
        stress: stressContext(),
        settledTurn: settledTurnContext(),
        empty: emptyContext(),
      },
    },
  },
};

/** Two related Tasks: the summary row reads "2 Tasks" and opens the shared Tasks list screen —
 * never the individual Task titles rendered inline. Full telemetry snapshot exercises every
 * `Progress` bar (context occupancy + both rate-limit windows), all comfortably under the
 * attention/danger thresholds. */
export const GenericWithRelatedTasks: Story = {
  tags: ['contract'],
  args: { value: genericSpecLevelContext() },
};

/** Exactly one related Task: the summary row still reads as a count ("1 zadanie"), but clicking it
 * opens that one Task directly (interim behaviour — see `SessionContext.tsx`'s
 * `openRelatedTasksEntry`). Partial telemetry: cost stays absent rather than a fake `$0`. */
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

/** Stress fixture in the ~330 px Secondary: long Specification/Task titles wrap into two-line
 * rows whose chevron stays centred on the whole row, and stale/danger telemetry. */
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

/** Every DYNAMIC section absent (owner decision 2's graceful-omission fixture): confirms the
 * Part 2 correction — Context is no longer a full-pane "nothing here" EmptyState in this case, it
 * shows the inline "no additional context" note alongside the always-present navigation skeleton
 * (`OtherAreasSection`), since that skeleton is a fixed entry point rather than session-derived
 * content that can legitimately be absent. */
export const EmptyWithNavigationSkeleton: Story = {
  tags: ['contract'],
  args: { value: emptyContext() },
};
