import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell, AppWorkspace, AppWorkspaceProvider, WorkspaceHeader } from '@nevo/ui';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import { SessionContext } from './SessionContext';
import {
  batchContext,
  emptyContext,
  genericSpecLevelContext,
  singleTaskContext,
  stressContext,
  terminalOutcomeContext,
} from './sessionContextFixtures';
import type { SessionContextViewModel } from './sessionContextTypes';

/**
 * Isolated catalog entry for the Context panel (no `ManagedSession` composition — that screen is
 * under separate, parallel edit): visual verification for the live-review fixes —
 * - Related Tasks collapses to one navigational summary row (icon + count + chevron), never the
 *   individual Task list, built from the real `OperationalRow` list pattern;
 * - consistent `Typography` tokens across every section instead of ad hoc `text-*`/`font-*`
 *   classes;
 * - `SessionTelemetrySection`'s new hierarchy — big-number stat cells for cost/tokens, the
 *   collapsed token-breakdown disclosure, and "Zużycie sesji"/"Limity dostawcy" as two visually
 *   separate sections, the rate-limit windows side by side as two columns;
 * - the §7.4 navigation skeleton (`OtherAreasSection`): one real, clickable, navigable
 *   `OperationalRow` per remaining root-tab subject.
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
              <SessionContext sessionId={sessionId} value={value} />
            </AppWorkspace.Primary>
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

/** Two related Tasks: the summary row reads "2 Tasks" and opens the shared Tasks list screen —
 * never the individual Task titles rendered inline. Full telemetry snapshot exercises every
 * `Progress` bar (context occupancy + both rate-limit windows), all comfortably under the
 * attention/danger thresholds. */
export const GenericWithRelatedTasks: Story = {
  args: { value: genericSpecLevelContext() },
};

/** Exactly one related Task: the summary row still reads as a count ("1 Tasks"), but clicking it
 * opens that one Task directly (interim behaviour — see `SessionContext.tsx`'s
 * `openRelatedTasksEntry`). Partial telemetry: cost stays absent rather than a fake `$0`. */
export const SingleRelatedTask: Story = {
  args: { value: singleTaskContext() },
};

/** Batch execution scope: several "current execution" Task rows, each a real `OperationalRow`
 * (icon, key + title, trailing chevron) instead of the old stacked-text `Button`. */
export const BatchExecution: Story = {
  args: { value: batchContext() },
};

/** Stale telemetry: every `Progress` bar and sentence carries the muted "Stale" cue. Also the
 * fixture whose rate-limit window crosses the danger threshold (390k/400k ≈ 98%). */
export const StaleTelemetry: Story = {
  args: { value: terminalOutcomeContext() },
};

/** Stress fixture: long Task/Specification titles, a longer related-Task list (3), mixed
 * Attention tones — the responsive/typography regression check for Parts 1–2. */
export const Stress: Story = {
  args: { value: stressContext() },
};

/** Mobile (375px): the same generic fixture, confirming the collapsed Related Tasks row, the
 * rebuilt telemetry hierarchy (stat cells, collapsed token breakdown, separated provider-limits
 * row), and the navigation skeleton below it all still read cleanly in the narrow Context flow. */
export const MobileGenericWithRelatedTasks: Story = {
  args: { value: genericSpecLevelContext() },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** Every DYNAMIC section absent (owner decision 2's graceful-omission fixture): confirms the
 * Part 2 correction — Context is no longer a full-pane "nothing here" EmptyState in this case, it
 * shows the inline "no additional context" note alongside the always-present navigation skeleton
 * (`OtherAreasSection`), since that skeleton is a fixed entry point rather than session-derived
 * content that can legitimately be absent. */
export const EmptyWithNavigationSkeleton: Story = {
  args: { value: emptyContext() },
};
