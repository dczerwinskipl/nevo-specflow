import { useSpecificationWorkflowTimeline, type FeedbackRef } from '../../../tasks';
import { ActivityHistory, type ActivityHistoryProps } from './ActivityHistory';

/**
 * The Specification's Activity history, the same on the Overview's Secondary and on the stacked
 * phone screen: its events and its workflow history in one timeline ({@link ActivityHistory}).
 */
export function SpecificationActivityHistory({
  specId,
  onOpenFeedback,
  onOpenDoc,
  ...props
}: Omit<ActivityHistoryProps, 'workflow' | 'showHeading'> & {
  readonly specId: string;
  /** Opens a feedback in the shared Feedback view (an entry's View feedback). */
  readonly onOpenFeedback?: ((ref: FeedbackRef) => void) | undefined;
}) {
  const workflow = useSpecificationWorkflowTimeline(specId, onOpenDoc);

  return (
    <ActivityHistory
      {...props}
      showHeading={false}
      workflow={{ ...workflow, specId, openFeedback: onOpenFeedback }}
      {...(onOpenDoc ? { onOpenDoc } : {})}
    />
  );
}
