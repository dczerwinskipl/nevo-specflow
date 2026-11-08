import { Button, Icon, Typography, cn } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { startSessionOffered } from '../../../sessions';
import type { StartSessionAction } from '../../read-model/model';
import { useWorkspaceRuntime } from '../WorkspaceContext';

export interface PreparationSectionProps {
  /** `actions.startSession` of the workspace read: it decides the button or the explanation. */
  readonly startSession?: StartSessionAction;
}

/**
 * The way from a Specification without Tasks to Tasks: an agent prepares them in a Session. With
 * the start offered the block opens New Session; when Sessions are turned off or not permitted it
 * only explains why there is no start here.
 */
export function PreparationSection({ startSession }: PreparationSectionProps) {
  const { t } = useTranslation();
  const runtime = useWorkspaceRuntime();
  const offered = startSessionOffered(startSession);
  const description = offered
    ? t('specification.prepareSpecificationDescription')
    : startSession?.reason === 'sessions_disabled'
      ? t('specification.prepareSessionsDisabled')
      : startSession?.reason === 'forbidden'
        ? t('specification.prepareStartForbidden')
        : t('specification.prepareSpecificationDescription');

  return (
    <section
      aria-labelledby="preparation-heading"
      className="rounded-control border-l-2 border-primary bg-primary/5 p-4"
    >
      <div className="flex items-center gap-2 text-accent-primary">
        <span className="flex size-4 shrink-0 items-center justify-center">
          <Icon name="chat" size="sm" />
        </span>
        <Typography
          as="h2"
          variant="section-label"
          id="preparation-heading"
          className="font-semibold text-content-primary"
        >
          {t('specification.prepareSpecificationHeading')}
        </Typography>
      </div>
      <Typography variant="body-sm" className="mt-2 text-content-secondary">
        {description}
      </Typography>
      {/* Without a start only the narrow history link remains, so the row is narrow-only too. */}
      <div className={cn('mt-4 flex flex-wrap items-center gap-4', !offered && 'lg:hidden')}>
        {offered ? (
          <Button leadingIcon="chat" onClick={runtime.openNewSession}>
            {t('specification.startSession')}
          </Button>
        ) : null}
        <button
          type="button"
          onClick={runtime.openHistory}
          className="text-body-sm font-medium text-accent-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring lg:hidden"
        >
          {t('specification.activityHistoryLink')}
        </button>
      </div>
    </section>
  );
}
