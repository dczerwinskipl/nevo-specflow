import { Icon, Skeleton, Spinner, Typography, cn } from '@nevo/ui';
import type { OperationStepStatus } from '@nevo/specflow-contracts/operations';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useMessage, type Message } from '../../i18n/message';

/** One checklist row. The operation's feature owns the copy: label and description are typed Messages. */
export interface OperationProgressStep {
  readonly id: string;
  readonly label: Message;
  /** One quiet line under the label: what is happening, what happened or what it waits for. */
  readonly description?: Message;
  readonly status: OperationStepStatus;
}

/** The single honest row shown while no step is known: it names the operation, never invents steps. */
export interface OperationProgressNeutral {
  readonly label: Message;
  readonly description?: Message;
}

export interface OperationProgressProps {
  /** Steps to draw (skipped ones are filtered by the caller). Empty: neutral row, placeholder or nothing. */
  readonly steps: readonly OperationProgressStep[];
  /** Accessible name of the list, owned by the operation's feature. */
  readonly label: Message;
  /**
   * While there are no steps (before the first snapshot, or no live stream): ONE running row that
   * says what is going on. Takes precedence over `placeholderRows`.
   */
  readonly neutral?: OperationProgressNeutral;
  /**
   * Before the first snapshot there is no checklist yet: reserve this many rows so nothing jumps
   * when the real steps arrive. 0 (default) renders nothing while there are no steps.
   */
  readonly placeholderRows?: number;
  readonly className?: string;
}

const rowClassName = 'grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3';
const markerClassName = 'inline-flex size-5 items-center justify-center';

function StepText({
  label,
  description,
  status,
  children,
}: {
  label: string;
  description?: string;
  status: OperationStepStatus;
  children?: ReactNode;
}) {
  const pending = status === 'pending';
  return (
    <div className="grid min-w-0 gap-0.5">
      <Typography
        as="span"
        variant="body-md"
        className={cn(
          'min-w-0 break-words',
          pending ? 'text-content-muted' : 'text-content-primary',
          status === 'running' && 'font-semibold',
        )}
      >
        {label}
        {children}
      </Typography>
      {description && (
        <Typography
          as="span"
          variant="body-sm"
          className={cn(
            'min-w-0 break-words',
            pending ? 'text-content-muted' : 'text-content-secondary',
          )}
        >
          {description}
        </Typography>
      )}
    </div>
  );
}

/**
 * Calm step checklist of a long-running operation, driven only by the steps it receives (it knows
 * no operation kind): the running step shows a spinner, finished ones a check, pending ones stay
 * muted; each step may carry a one-line description. A polite live region announces changes; rows
 * keep a fixed marker column so the layout does not move between states, including at 320 px.
 */
export function OperationProgress({
  steps,
  label,
  neutral,
  placeholderRows = 0,
  className,
}: OperationProgressProps) {
  const { t } = useTranslation();
  const text = useMessage();
  if (steps.length === 0 && !neutral && placeholderRows === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={text(label)}
      className={cn('grid min-w-0 gap-3', className)}
    >
      {steps.length === 0 && neutral ? (
        <div className={rowClassName} data-operation-progress="neutral">
          <span className={markerClassName} aria-hidden="true">
            <Spinner size="md" className="text-status-info" />
          </span>
          <StepText
            label={text(neutral.label)}
            description={neutral.description ? text(neutral.description) : undefined}
            status="running"
          />
        </div>
      ) : steps.length === 0 ? (
        <div aria-hidden="true" className="grid min-w-0 gap-2">
          {Array.from({ length: placeholderRows }, (_, index) => (
            <div key={index} className={rowClassName}>
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ))}
        </div>
      ) : (
        <ol className="m-0 grid min-w-0 list-none gap-4 p-0">
          {steps.map((step) => (
            <li
              key={step.id}
              className={rowClassName}
              aria-current={step.status === 'running' ? 'step' : undefined}
            >
              <span className={markerClassName} aria-hidden="true">
                {step.status === 'running' ? (
                  <Spinner size="md" className="text-status-info" />
                ) : step.status === 'done' ? (
                  <Icon name="check" size="sm" className="text-status-success" />
                ) : (
                  <span className="size-2 rounded-full bg-content-muted" />
                )}
              </span>
              <StepText
                label={text(step.label)}
                description={step.description ? text(step.description) : undefined}
                status={step.status}
              >
                <span className="sr-only">
                  {' '}
                  {t(
                    `operations.progress.status.${step.status === 'skipped' ? 'done' : step.status}`,
                  )}
                </span>
              </StepText>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
