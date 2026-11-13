import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineNote } from '@nevo/ui';
import { goToHeading } from '../InlineAction';
import { WorkflowNow } from '../WorkflowNow';
import {
  SPECIFICATION_NOW_HEADING,
  useSpecificationNowVisible,
  useSpecificationWorkflow,
} from './SpecificationWorkflow';

/**
 * The Specification's Now block on its Overview, in the preparation block's place: with a workflow
 * (project Runtime, current Specification) the block, else `fallback`. Once the workflow ended,
 * Close specification is its one action; an abandoned Specification says why.
 */
export function SpecificationNow({
  documents,
  fallback,
}: {
  /** The Specification's documents, offered as finish artifacts. */
  readonly documents: readonly { readonly value: string; readonly label: string }[];
  readonly fallback: ReactNode;
}) {
  const { t } = useTranslation();
  const workflow = useSpecificationWorkflow();
  const visible = useSpecificationNowVisible();
  const projection = workflow?.projection;
  if (!workflow || !visible) {
    return fallback;
  }

  if (!projection) {
    // Loading or unavailable: the block appears once the projection is read.
    return null;
  }

  const { position } = projection;
  const terminal = position.kind === 'terminal';
  const abandonment = terminal ? position.abandonment : undefined;

  return (
    <WorkflowNow
      subject={{ specId: workflow.specId }}
      projection={projection}
      headingId={SPECIFICATION_NOW_HEADING}
      status={
        abandonment ? (
          <InlineNote role="status" icon="archive">
            {/* Who and when are the position's own line below; the reason is said once, here. */}
            <span className="font-medium text-content-primary">{abandonment.reason}</span>
          </InlineNote>
        ) : undefined
      }
      links={{ tasks: () => goToHeading('tasks-heading') }}
      primaryAction={
        terminal && projection.specification?.exit ? (
          <Button onClick={() => workflow.openExit('close')}>
            {t('workflowExecution.close.action')}
          </Button>
        ) : undefined
      }
      artifactOptions={documents}
    />
  );
}
