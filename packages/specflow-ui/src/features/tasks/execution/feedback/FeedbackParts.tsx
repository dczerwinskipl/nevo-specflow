import { useTranslation } from 'react-i18next';
import { Icon, Typography, cn } from '@nevo/ui';
import { TextAction } from '../../../../shared/actions';
import { productIcons } from '../../../../shared/product-icons';
import { formatWhen, personLabel } from '../presentation';
import { useViewer } from '../useViewer';
import type { AttemptItem } from './feedbackRef';

/**
 * "View feedback ›": the one way from a hand-off or a history entry to its feedback, which only the
 * shared Feedback view presents (workflow-execution.md, "Feedback"). Never a preview in place.
 */
export function FeedbackLink({
  onOpen,
  className,
}: {
  readonly onOpen: () => void;
  readonly className?: string;
}) {
  const { t } = useTranslation();

  return (
    <TextAction
      chevron="navigate"
      className={cn('justify-self-start text-body-sm', className)}
      onClick={onOpen}
      data-feedback-link=""
    >
      {t('workflowExecution.feedback.view')}
    </TextAction>
  );
}

/**
 * The owner's decision on an attempt's result, as one line of that attempt: "Confirmed by you ·
 * 5:09 PM", "Rejected by you · 5:09 PM". The decision stays its own record; only the history shows
 * it with the attempt it decided. `withDay` names the day too (outside a history grouped by day).
 */
export function DecisionLine({
  confirmation,
  withDay = false,
}: {
  readonly confirmation: NonNullable<AttemptItem['confirmation']>;
  readonly withDay?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const { actor } = confirmation;
  const who =
    actor.class === 'human'
      ? personLabel(t, actor.details.actorId, viewer)
      : t('taskDetails.executor.agent');
  const date = new Date(confirmation.at);
  const at = withDay
    ? formatWhen(t, confirmation.at, i18n.language)
    : Number.isNaN(date.getTime())
      ? confirmation.at
      : new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' }).format(date);

  return (
    <Typography
      as="p"
      variant="body-sm"
      className="flex min-w-0 items-start gap-2 text-content-secondary"
      data-attempt-decision={confirmation.state}
    >
      <span className="flex h-[1lh] shrink-0 items-center">
        <Icon name={productIcons.ownerDecision} size="sm" aria-hidden="true" />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {t(
          confirmation.state === 'confirmed'
            ? 'workflowExecution.attemptHistory.confirmedBy'
            : 'workflowExecution.attemptHistory.rejectedBy',
          { who, at },
        )}
      </span>
    </Typography>
  );
}
