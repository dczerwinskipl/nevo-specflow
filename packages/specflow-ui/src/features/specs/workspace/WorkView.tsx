import { Fragment, useState, useSyncExternalStore } from 'react';
import { cn, useContainerMinWidth } from '@nevo/ui';
import { useUiModules } from '../../../app/ui-modules/UiModulesProvider';
import type { SpecificationWorkSectionContext } from '../extensions/specificationWorkSections';
import {
  hasVisibleWorkSections,
  SpecificationWorkSectionOutlet,
} from './SpecificationWorkSectionOutlet';
import {
  hasSpecificationAttention,
  SpecificationAttentionOutlet,
} from './SpecificationAttentionOutlet';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { useWorkspaceRuntime } from './WorkspaceContext';
import { SpecificationSummarySection, PreparationSection } from './sections';
import { usePreserveFocusAcrossLayout } from './usePreserveFocusAcrossLayout';

/** Content width (CSS px) from which the Overview shows two columns. Owner decision, 2026-11-07. */
export const OVERVIEW_TWO_COLUMN_MIN_WIDTH = 1408;
/**
 * Two columns stay until the content is this much narrower than the threshold, so the change of
 * arrangement (or a scrollbar it brings) can never make the Overview oscillate at the breakpoint.
 */
export const OVERVIEW_TWO_COLUMN_HYSTERESIS = 16;

/** A column's opening section starts like the Requires attention block: 12 px, no divider. */
const opensColumn = '[&>*:first-child]:border-t-0 [&>*:first-child]:pt-3';
/** The same, for the work column's next section when Requires attention renders nothing. */
const opensColumnAfterEmptyPeer =
  'peer-empty:[&>*:first-child]:border-t-0 peer-empty:[&>*:first-child]:pt-3';

const noSubscription = () => () => undefined;

/** `false` while rendering on the server, `true` in the browser. */
function useIsClient() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export interface WorkViewProps {
  readonly specId?: string;
  readonly data: SpecificationWorkspaceData;
}

/**
 * Specification Workspace work view composition root.
 * Coordinates section layout without monolithic state management.
 *
 * Below `OVERVIEW_TWO_COLUMN_MIN_WIDTH` of content width the sections form one reading column in
 * their priority order: Requires attention, Continue session, other context, preparation, Tasks,
 * Documents. From that width they form two columns that fill the pane: the work column (Requires
 * attention, preparation, Tasks) and the context column (Continue session, Documents, other
 * context), with the summary above both. Each column stacks on its own, so a missing section
 * leaves no gap and both columns start on one line. Two columns need a section on each side;
 * otherwise Overview stays one column at any width.
 *
 * The width is measured (`useContainerMinWidth`, on a zero-height sentinel) rather than queried in
 * CSS because the DOM order changes with it: keyboard and reading order follow the visible order
 * in both arrangements, and independent columns need their own containers. The summary, Requires
 * attention, preparation and Tasks stay keyed children of one parent, so a crossing moves them
 * without remounting (a Task selection survives it). The context sections change parent and do
 * remount: Documents' "show all" resets, and focus inside them is restored by
 * `usePreserveFocusAcrossLayout`. They are not mounted before the first measurement, so an
 * Overview opening wide does not mount them in one column first.
 */
export function WorkView({ specId, data }: WorkViewProps) {
  const modules = useUiModules();
  const runtime = useWorkspaceRuntime();
  const client = useIsClient();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const {
    matches: wide,
    measured,
    setElement: setSentinel,
  } = useContainerMinWidth(OVERVIEW_TWO_COLUMN_MIN_WIDTH, {
    hysteresis: OVERVIEW_TWO_COLUMN_HYSTERESIS,
  });
  const id = specId ?? data.id;
  const context: SpecificationWorkSectionContext = { specId: id, data, actions: runtime };
  const preparationShown = data.isEmpty === true && runtime.canStartConversation !== false;
  const hasContextSide = hasVisibleWorkSections(modules, ['resume', 'context', 'related'], context);
  const hasWorkSide =
    preparationShown ||
    hasVisibleWorkSections(modules, ['main'], context) ||
    hasSpecificationAttention(modules, context);
  const twoColumns = wide && hasContextSide && hasWorkSide;
  // In the browser the context sections wait for the first measurement (it runs before paint).
  const contextReady = measured || !client;
  usePreserveFocusAcrossLayout(root, twoColumns);

  const summary = (
    <div key="summary" className={cn('pb-3', twoColumns && 'col-span-2')}>
      <SpecificationSummarySection
        title={data.title}
        specId={id}
        intro={data.intro}
        isEmpty={data.isEmpty}
        mainDocumentId={data.mainDocumentId}
      />
    </div>
  );
  // `peer`: when Requires attention renders nothing, the next work section opens the column.
  const attention = (
    <div key="attention" className={cn(twoColumns && 'peer col-start-1 min-w-0')}>
      <SpecificationAttentionOutlet specId={id} data={data} />
    </div>
  );
  // Preparation is a conversation call-to-action: without a conversation it is not offered.
  const preparation = preparationShown ? (
    <div
      key="preparation"
      className={cn(
        'border-t border-border-default py-4 @min-[40rem]/work:py-5',
        twoColumns && 'col-start-1 min-w-0 peer-empty:border-t-0 peer-empty:pt-3',
      )}
    >
      <PreparationSection />
    </div>
  ) : null;
  const main = (
    <div
      key="main"
      className={cn(
        twoColumns && 'col-start-1 min-w-0',
        twoColumns && !preparation && opensColumnAfterEmptyPeer,
      )}
    >
      <SpecificationWorkSectionOutlet slot="main" specId={id} data={data} modules={modules} />
    </div>
  );
  const outlet = (slot: 'resume' | 'context' | 'related') =>
    contextReady ? (
      <SpecificationWorkSectionOutlet slot={slot} specId={id} data={data} modules={modules} />
    ) : null;

  return (
    <div
      ref={setRoot}
      className="@container/work min-w-0"
      data-overview-columns={twoColumns ? 2 : 1}
    >
      {/* Measured instead of the content, whose height changes with the arrangement. */}
      <div ref={setSentinel} aria-hidden="true" className="h-0" data-overview-sentinel="" />
      {twoColumns ? (
        // The last row is flexible, so the context column (spanning every row under the summary)
        // never stretches the rows of the work column: Tasks follow Requires attention directly.
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] grid-rows-[auto_auto_auto_1fr] gap-x-12">
          {summary}
          {attention}
          {preparation}
          {main}
          <div
            key="side"
            className={cn('col-start-2 row-span-3 row-start-2 min-w-0', opensColumn)}
            data-overview-column="context"
          >
            {outlet('resume')}
            {outlet('related')}
            {outlet('context')}
          </div>
        </div>
      ) : (
        <div className="max-w-content-standard">
          {summary}
          {attention}
          <Fragment key="resume">{outlet('resume')}</Fragment>
          <Fragment key="context">{outlet('context')}</Fragment>
          {preparation}
          {main}
          <Fragment key="related">{outlet('related')}</Fragment>
        </div>
      )}
    </div>
  );
}
