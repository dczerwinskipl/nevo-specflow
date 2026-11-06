import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isA3Family } from '../../../app/layoutPrototype';
import { useUiModules } from '../../../app/ui-modules/UiModulesProvider';
import { SpecificationWorkSectionOutlet } from './SpecificationWorkSectionOutlet';
import { SpecificationAttentionOutlet } from './SpecificationAttentionOutlet';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { useWorkspaceRuntime } from './WorkspaceContext';
import { SpecificationSummarySection, PreparationSection } from './sections';

export interface WorkViewProps {
  readonly specId?: string;
  readonly data: SpecificationWorkspaceData;
  /** PROTOTYPE (A3h): extra content appended to the side column when the view shows two columns. */
  readonly aside?: ReactNode;
}

/**
 * Specification Workspace work view composition root.
 * Coordinates section layout without monolithic state management.
 */
export function WorkView({ specId, data, aside }: WorkViewProps) {
  const modules = useUiModules();
  const runtime = useWorkspaceRuntime();
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isA3Family || !ref.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);
  // PROTOTYPE (A3): a wide pane shows the operational sections side by side instead of centring a
  // reading column; narrower panes keep the current single column and its order.
  const twoColumns = isA3Family && width >= 1408;

  const summary = (
    <div className="pb-3">
      <SpecificationSummarySection
        title={data.title}
        specId={specId ?? data.id}
        intro={data.intro}
        isEmpty={data.isEmpty}
        mainDocumentId={data.mainDocumentId}
      />
    </div>
  );
  const attention = <SpecificationAttentionOutlet specId={specId ?? data.id} data={data} />;
  const context = (
    <SpecificationWorkSectionOutlet
      slot="context"
      specId={specId ?? data.id}
      data={data}
      modules={modules}
    />
  );
  const preparation =
    data.isEmpty && runtime.canStartConversation !== false ? (
      <div className="border-t border-border-default py-4 @min-[40rem]/work:py-5">
        <PreparationSection />
      </div>
    ) : null;
  const main = (
    <SpecificationWorkSectionOutlet
      slot="main"
      specId={specId ?? data.id}
      data={data}
      modules={modules}
    />
  );
  const related = (
    <SpecificationWorkSectionOutlet
      slot="related"
      specId={specId ?? data.id}
      data={data}
      modules={modules}
    />
  );

  if (twoColumns) {
    return (
      <div ref={ref} className="@container/work min-w-0">
        {summary}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)] gap-x-12">
          <div className="min-w-0">
            {attention}
            {main}
          </div>
          <div className="min-w-0 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0">
            {context}
            {preparation}
            {related}
            {aside}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={
        isA3Family ? '@container/work min-w-0' : '@container/work min-w-0 max-w-content-standard'
      }
    >
      <div className={isA3Family ? 'max-w-content-standard' : undefined}>
        {summary}
        {attention}
        {context}
        {/* Preparation is a conversation call-to-action: without a conversation it is not offered. */}
        {preparation}
        {main}
        {related}
      </div>
    </div>
  );
}
