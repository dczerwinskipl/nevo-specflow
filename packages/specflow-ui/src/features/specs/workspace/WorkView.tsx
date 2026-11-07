import { Fragment } from 'react';
import { cn, useContainerMinWidth } from '@nevo/ui';
import { useUiModules } from '../../../app/ui-modules/UiModulesProvider';
import { SpecificationWorkSectionOutlet } from './SpecificationWorkSectionOutlet';
import { SpecificationAttentionOutlet } from './SpecificationAttentionOutlet';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { useWorkspaceRuntime } from './WorkspaceContext';
import { SpecificationSummarySection, PreparationSection } from './sections';

/** Content width (CSS px) from which the Overview shows two columns. Owner decision, 2026-11-07. */
export const OVERVIEW_TWO_COLUMN_MIN_WIDTH = 1408;

/** A column's opening section starts like the Requires attention block: 12 px, no divider. */
const opensColumn = '[&>*:first-child]:border-t-0 [&>*:first-child]:pt-3';
/** The same, for the work column's next section when Requires attention renders nothing. */
const opensColumnAfterEmptyPeer =
  'peer-empty:[&>*:first-child]:border-t-0 peer-empty:[&>*:first-child]:pt-3';

export interface WorkViewProps {
  readonly specId?: string;
  readonly data: SpecificationWorkspaceData;
}

/**
 * Specification Workspace work view composition root.
 * Coordinates section layout without monolithic state management.
 *
 * Below `OVERVIEW_TWO_COLUMN_MIN_WIDTH` of content width the sections form one reading column in
 * their priority order. From that width they form two columns that fill the pane: work on the left
 * (Requires attention, preparation, Tasks), context on the right (Continue session, repository,
 * Documents), with the summary above both. Each column stacks on its own, so a missing section
 * leaves no gap and both columns start on one line.
 *
 * The width is measured (`useContainerMinWidth`) rather than queried in CSS because the DOM order
 * changes with it: keyboard
 * and reading order follow the visible order in both arrangements, and independent columns need
 * their own containers. The summary, Requires attention, preparation and Tasks stay keyed children
 * of one parent, so crossing the threshold (for example when the Secondary opens) moves them
 * without remounting: a Task selection or an expanded description survives it.
 */
export function WorkView({ specId, data }: WorkViewProps) {
  const modules = useUiModules();
  const runtime = useWorkspaceRuntime();
  const { matches: twoColumns, setElement } = useContainerMinWidth(OVERVIEW_TWO_COLUMN_MIN_WIDTH);
  const id = specId ?? data.id;

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
  const preparation =
    data.isEmpty && runtime.canStartConversation !== false ? (
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
  const context = (
    <SpecificationWorkSectionOutlet slot="context" specId={id} data={data} modules={modules} />
  );
  const related = (
    <SpecificationWorkSectionOutlet slot="related" specId={id} data={data} modules={modules} />
  );

  return (
    <div
      ref={setElement}
      className="@container/work min-w-0"
      data-overview-columns={twoColumns ? 2 : 1}
    >
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
            {context}
            {related}
          </div>
        </div>
      ) : (
        <div className="max-w-content-standard">
          {summary}
          {attention}
          <Fragment key="context">{context}</Fragment>
          {preparation}
          {main}
          <Fragment key="related">{related}</Fragment>
        </div>
      )}
    </div>
  );
}
