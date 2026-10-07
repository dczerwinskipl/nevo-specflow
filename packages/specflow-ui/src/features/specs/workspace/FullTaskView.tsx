import { Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TaskItem } from './model';

export interface FullTaskViewProps {
  readonly task: TaskItem;
  readonly specKey: string;
  readonly onBack: () => void;
  readonly onOpenSession?: (sessionId: string) => void;
}

export function FullTaskView({ task, specKey, onBack, onOpenSession }: FullTaskViewProps) {
  const { t } = useTranslation();

  return (
    <div className="grid max-w-content-standard gap-6 py-2">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-2 text-body-sm font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        <Icon name="arrow-right" size="sm" className="rotate-180" />
        <span>{t('specification.backToSpecification')}</span>
      </button>

      <div>
        <p className="font-mono text-body-xs text-content-muted">
          {task.id} · {specKey}
        </p>
        <Typography
          as="h1"
          variant="title-md"
          className="mt-1 font-semibold text-content-primary [overflow-wrap:anywhere]"
        >
          {task.title}
        </Typography>
        <p className="mt-1 text-body-sm text-content-secondary">
          {task.status}
          {task.additionalInfo ? ` · ${task.additionalInfo}` : ''}
        </p>
      </div>

      <article className="grid gap-6 border-t border-border-subtle pt-6 leading-relaxed text-content-secondary">
        <div>
          <Typography as="h2" variant="title-sm" className="font-medium text-content-primary">
            {t('specification.taskFullPurposeHeading')}
          </Typography>
          <p className="mt-1 text-body-sm">{t('specification.taskFullPurposeContent')}</p>
        </div>

        <div>
          <Typography as="h2" variant="title-sm" className="font-medium text-content-primary">
            {t('specification.taskFullAcceptanceHeading')}
          </Typography>
          <ul className="mt-1.5 list-disc pl-5 text-body-sm grid gap-1">
            <li>{t('specification.taskFullAcceptanceItem1')}</li>
            <li>{t('specification.taskFullAcceptanceItem2')}</li>
            <li>{t('specification.taskFullAcceptanceItem3')}</li>
          </ul>
        </div>

        <div>
          <Typography as="h2" variant="title-sm" className="font-medium text-content-primary">
            {t('specification.taskFullWorkflowHeading')}
          </Typography>
          <p className="mt-1 text-body-sm">
            {t('specification.taskFullWorkflowContent', { status: task.status })}
          </p>
        </div>

        <div>
          <Typography as="h2" variant="title-sm" className="font-medium text-content-primary">
            {t('specification.taskFullEvidenceHeading')}
          </Typography>
          <div className="mt-2 flex flex-wrap gap-4 text-body-sm">
            <button
              type="button"
              className="text-left font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.taskFullReviewSummary')}
            </button>
            <button
              type="button"
              className="text-left font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              {t('specification.taskFullVerificationResult')}
            </button>
          </div>
        </div>

        {onOpenSession ? (
          <div>
            <Typography as="h2" variant="title-sm" className="font-medium text-content-primary">
              {t('specification.taskFullRelatedSessionsHeading')}
            </Typography>
            <div className="mt-2">
              <button
                type="button"
                onClick={() => onOpenSession('review')}
                className="text-left text-body-sm font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                {t('specification.taskFullSecurityReviewSession')}
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <Typography as="h2" variant="title-sm" className="font-medium text-content-primary">
            {t('specification.taskFullHistoryHeading')}
          </Typography>
          <p className="mt-1 text-body-xs text-content-muted">
            {t('specification.taskFullHistoryContent')}
          </p>
        </div>
      </article>
    </div>
  );
}
