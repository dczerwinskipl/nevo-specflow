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
import { SpecificationNow, useSpecificationNowVisible } from '../../tasks';

/** Content width (CSS px) from which the Overview shows two columns. Owner decision, 2026-11-07. */
export const OVERVIEW_TWO_COLUMN_MIN_WIDTH = 1408;
/**
 * Two columns stay until the content is this much narrower than the threshold, so the change of
 * arrangement (or a scrollbar it brings) can never make the Overview oscillate at the breakpoint.
 */
export const OVERVIEW_TWO_COLUMN_HYSTERESIS = 16;

/** The first section of a column starts 12 px under the summary, without a divider. */
const opening = 'pt-3 pb-4 @min-[40rem]/work:pb-5';
/** Every later section is divided from the one above it. */
const following = 'border-t border-border-default py-4 @min-[40rem]/work:py-5';
/** A slot outlet's first section opens its column (its own wrapper carries the divider). */
const opensColumn = '[&>*:first-child]:border-t-0 [&>*:first-child]:pt-3';

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
 * Specification Overview composition root: the control center of one Specification.
 *
 * Below `OVERVIEW_TWO_COLUMN_MIN_WIDTH` of content width the sections form one reading column in
 * their priority order: summary, Now (or the preparation block), Requires attention, Tasks,
 * Sessions, Documents, other context. From that width they form two columns that fill the pane:
 * the work column (Now, Requires attention, Tasks) and the context column (Sessions, Documents,
 * other context), with the summary above both. Each column stacks on its own, so a missing section
 * leaves no gap and both columns start on one line. Two columns need a section on each side;
 * otherwise Overview stays one column at any width.
 *
 * The width is measured (`useContainerMinWidth`, on a zero-height sentinel) rather than queried in
 * CSS because the DOM order changes with it: keyboard and reading order follow the visible order
 * in both arrangements, and independent columns need their own containers. The summary, Now,
 * Requires attention and Tasks stay keyed children of one parent, so a crossing moves them without
 * remounting. The context sections change parent and do remount: their view state lives outside
 * them (Documents' "show all" in the Specification store), and focus inside them is restored by
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
  // No Tasks and no Session to continue: the preparation block explains (and, when the start is
  // offered, opens) the way to Tasks.
  const preparationShown = data.isEmpty === true && !data.resumeSession;
  const nowShown = useSpecificationNowVisible();
  const nowBlock = nowShown || preparationShown;
  const attentionShown = hasSpecificationAttention(modules, context);
  const mainShown = hasVisibleWorkSections(modules, ['main'], context);
  const hasContextSide = hasVisibleWorkSections(modules, ['resume', 'context', 'related'], context);
  const hasWorkSide = nowBlock || mainShown || attentionShown;
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
        overviewDocumentId={data.overviewDocumentId}
      />
    </div>
  );
  // With a workflow (project Runtime) the Now block opens the work; without one it renders the
  // preparation block in its place.
  const now = nowBlock ? (
    <div key="now" className={cn(opening, 'empty:hidden', twoColumns && 'col-start-1 min-w-0')}>
      <SpecificationNow
        documents={data.documents.map((document) => ({
          value: document.filename ?? document.id,
          label: document.title,
        }))}
        documentName={(documentId) => {
          const document = data.documents.find((candidate) => candidate.id === documentId);

          return document ? (document.filename ?? document.title) : undefined;
        }}
        progress={data.taskProgress}
        stuck={data.taskOverview?.stuck}
        fullTaskHref={runtime.fullTaskHref}
        onOpenTask={(taskId) => runtime.openTask(taskId)}
        onOpenDocument={(documentId) => runtime.openDoc(documentId)}
        onOpenHistory={runtime.openHistory}
        fallback={preparationShown ? <PreparationSection startSession={data.startSession} /> : null}
      />
    </div>
  ) : null;
  const attention = attentionShown ? (
    <div
      key="attention"
      className={cn(nowBlock ? following : opening, twoColumns && 'col-start-1 min-w-0')}
    >
      <SpecificationAttentionOutlet specId={id} data={data} />
    </div>
  ) : null;
  const main = mainShown ? (
    <div
      key="main"
      className={cn(
        twoColumns && 'col-start-1 min-w-0',
        !nowBlock && !attentionShown && opensColumn,
      )}
    >
      <SpecificationWorkSectionOutlet slot="main" specId={id} data={data} modules={modules} />
    </div>
  ) : null;
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
          {now}
          {attention}
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
          {now}
          {attention}
          {main}
          <Fragment key="resume">{outlet('resume')}</Fragment>
          <Fragment key="related">{outlet('related')}</Fragment>
          <Fragment key="context">{outlet('context')}</Fragment>
        </div>
      )}
    </div>
  );
}
