import { useSpecificationWorkflowTimeline, type AttemptRef } from '../../../tasks';
import { ActivityHistory, type ActivityHistoryProps } from './ActivityHistory';

/**
 * The Specification's Activity history, the same on the Overview's Secondary and on the stacked
 * phone screen: its events and its workflow history in one timeline ({@link ActivityHistory}).
 */
export function SpecificationActivityHistory({
  specId,
  feedback,
  onOpenDoc,
  ...props
}: Omit<ActivityHistoryProps, 'workflow' | 'showHeading'> & {
  readonly specId: string;
  /** The attempt whose feedback the reader opened ("Open full feedback"). */
  readonly feedback?: AttemptRef | undefined;
}) {
  const workflow = useSpecificationWorkflowTimeline(specId, onOpenDoc);

  return (
    <ActivityHistory
      {...props}
      showHeading={false}
      workflow={{ ...workflow, specId, feedback }}
      {...(onOpenDoc ? { onOpenDoc } : {})}
    />
  );
}
