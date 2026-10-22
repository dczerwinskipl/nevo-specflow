import { Icon, Skeleton, Spinner, Typography, cn } from '@nevo/ui';
import type { OperationStepStatus } from '@nevo/specflow-contracts/operations';
import { useTranslation } from 'react-i18next';

import { useMessage, type Message } from '../../i18n/message';

/** One checklist row. The operation's feature owns the copy: the label is a typed Message. */
export interface OperationProgressStep {
  readonly id: string;
  readonly label: Message;
  readonly status: OperationStepStatus;
}

export interface OperationProgressProps {
  /** Steps to draw (skipped ones are filtered by the caller). Empty: nothing or a placeholder. */
  readonly steps: readonly OperationProgressStep[];
  /** Accessible name of the list, owned by the operation's feature. */
  readonly label: Message;
  /**
   * Before the first snapshot there is no checklist yet: reserve this many rows so nothing jumps
   * when the real steps arrive. 0 (default) renders nothing while there are no steps.
   */
  readonly placeholderRows?: number;
  readonly className?: string;
}

const rowClassName = 'grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3';

/**
 * Calm step checklist of a long-running operation, driven only by the steps it receives (it knows
 * no operation kind): the running step shows a spinner, finished ones a check, pending ones stay
 * muted. A polite live region announces changes; rows keep a fixed marker column so the layout
 * does not move between states, including at 320 px.
 */
export function OperationProgress({
  steps,
  label,
  placeholderRows = 0,
  className,
}: OperationProgressProps) {
  const { t } = useTranslation();
  const text = useMessage();
  if (steps.length === 0 && placeholderRows === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={text(label)}
      className={cn('grid min-w-0 gap-2', className)}
    >
      {steps.length === 0 ? (
        <div aria-hidden="true" className="grid min-w-0 gap-2">
          {Array.from({ length: placeholderRows }, (_, index) => (
            <div key={index} className={rowClassName}>
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ))}
        </div>
      ) : (
        <ol className="m-0 grid min-w-0 list-none gap-2 p-0">
          {steps.map((step) => (
            <li
              key={step.id}
              className={rowClassName}
              aria-current={step.status === 'running' ? 'step' : undefined}
            >
              <span className="inline-flex size-4 items-center justify-center" aria-hidden="true">
                {step.status === 'running' ? (
                  <Spinner size="sm" />
                ) : step.status === 'done' ? (
                  <Icon name="check" size="sm" className="text-status-success" />
                ) : (
                  <span className="size-1.5 rounded-full bg-content-muted" />
                )}
              </span>
              <Typography
                as="span"
                variant="body-md"
                className={cn(
                  'min-w-0 break-words',
                  step.status === 'pending' ? 'text-content-muted' : 'text-content-primary',
                )}
              >
                {text(step.label)}
                <span className="sr-only">
                  {' '}
                  {t(
                    `operations.progress.status.${step.status === 'skipped' ? 'done' : step.status}`,
                  )}
                </span>
              </Typography>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
