import { useId } from 'react';
import {
  Badge,
  Checkbox,
  cn,
  fastColorTransitionClassName,
  Icon,
  Link,
  MenuItem,
  MenuSeparator,
  OverflowMenu,
  Typography,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import {
  orderedSignals,
  type SpecRowSelection,
  type SpecSteeringItemProjection,
  type SteeringTarget,
} from './model';

export interface SpecListRowProps {
  readonly item: SpecSteeringItemProjection;
  readonly archived?: boolean;
  readonly onOpenTarget?: (target: SteeringTarget) => void;
  readonly selection?: SpecRowSelection;
}

export function SpecListRow({ item, archived = false, onOpenTarget, selection }: SpecListRowProps) {
  const { t, i18n } = useTranslation();
  const selectionId = useId();
  const target: SteeringTarget = { kind: 'specification', specId: item.id };
  const available = item.steeringAvailable !== false;
  const signal = available ? orderedSignals(item)[0] : undefined;
  const pullRequests = item.pullRequests ?? [];
  const tags = item.tags ?? [];
  const execution = item.currentExecutions[0];
  return (
    <li
      className={cn(
        '@container/spec-row group relative grid min-h-14 min-w-0 grid-cols-[calc(var(--spacing)*12)_minmax(0,1fr)_var(--spacing-control-height-default)] items-start py-2',
        onOpenTarget && 'cursor-pointer hover:bg-surface-hover',
        selection?.selected && 'bg-surface-selected',
        fastColorTransitionClassName,
      )}
      data-spec-id={item.id}
    >
      {onOpenTarget ? (
        <button
          className="absolute inset-0 cursor-pointer rounded-control outline-none focus-visible:outline-2 focus-visible:outline-focus-ring"
          aria-label={t('specs.openSpec', { title: item.title })}
          type="button"
          onClick={() => onOpenTarget(target)}
        />
      ) : null}
      <div className="flex items-center justify-center self-stretch">
        {selection ? (
          <label
            htmlFor={selectionId}
            className="relative z-10 flex size-control-height-default cursor-pointer items-center justify-center"
          >
            <Checkbox
              id={selectionId}
              checked={selection.selected}
              aria-label={t('specs.selectSpec', { title: item.title })}
              onCheckedChange={(checked) => selection.onSelectedChange(checked === true)}
            />
          </label>
        ) : null}
      </div>
      <div className="pointer-events-none flex min-w-0 flex-col gap-x-4 gap-y-1 self-stretch pr-2 @2xl/spec-row:flex-row @2xl/spec-row:items-center">
        <div className="min-w-0 flex-1">
          <Typography
            as="h3"
            variant="title-sm"
            className={cn(
              'min-w-0 text-content-primary [overflow-wrap:anywhere]',
              onOpenTarget && 'group-hover:underline',
            )}
            data-spec-title
          >
            {item.title}
          </Typography>
          <Typography
            as="div"
            variant="body-sm"
            className="flex min-w-0 flex-wrap items-baseline gap-x-3 text-content-muted"
          >
            {item.key ? <span className="[overflow-wrap:anywhere]">{item.key}</span> : null}
            <span>{t('specs.progress', item.progress)}</span>
            {archived ? (
              <time dateTime={item.updatedAt}>
                {t('specs.updated', {
                  date: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(item.updatedAt)),
                })}
              </time>
            ) : !available ? (
              <span>{t('specs.signalsUnavailable')}</span>
            ) : signal?.kind === 'attention' || signal?.kind === 'issue' ? (
              <span
                className="inline-flex min-w-0 items-baseline gap-1 text-content-secondary"
                title={signal.reason}
                data-spec-reason
              >
                <Icon
                  name={
                    signal.attentionReason === 'blocked'
                      ? 'triangle-alert'
                      : signal.attentionReason === 'review'
                        ? 'file-search'
                        : signal.kind === 'attention'
                          ? 'chat'
                          : 'info'
                  }
                  size="sm"
                  className="mt-0.5 self-start"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">{signal.label}</span>
              </span>
            ) : signal?.kind === 'working' && execution ? (
              <span>
                {t('specs.execution', {
                  role: execution.agentRole,
                  count: execution.taskIds.length,
                })}
                {item.currentExecutions.length > 1
                  ? ` · +${item.currentExecutions.length - 1}`
                  : ''}
              </span>
            ) : null}
          </Typography>
        </div>
        {pullRequests.length || tags.length ? (
          <div
            className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-content-secondary"
            data-spec-metadata
          >
            {pullRequests[0] ? (
              <Link
                className="pointer-events-auto relative z-10 inline-flex min-h-6 items-center rounded-control-inline after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] @2xl/spec-row:after:inset-y-0"
                tone="default"
                href={pullRequests[0].url}
                aria-label={t('specs.openPullRequest', {
                  number: pullRequests[0].number,
                  title: item.title,
                })}
              >
                <span className="inline-flex items-center gap-1 underline decoration-current/50">
                  <Icon name="branch" size="sm" />
                  PR #{pullRequests[0].number}
                </span>
              </Link>
            ) : null}
            {pullRequests.length > 1 ? (
              <Typography
                className="inline-flex min-h-6 items-center"
                title={pullRequests.map((pr) => `PR #${pr.number}`).join(', ')}
                variant="body-sm"
              >
                +{pullRequests.length - 1}
              </Typography>
            ) : null}
            {tags.slice(0, 2).map((tag) => (
              <Badge className="min-h-6 max-w-32 [&>span]:truncate" title={tag} key={tag}>
                {tag}
              </Badge>
            ))}
            {tags.length > 2 ? (
              <Typography
                className="inline-flex min-h-6 items-center"
                title={tags.slice(2).join(', ')}
                variant="body-sm"
              >
                +{tags.length - 2}
              </Typography>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="relative z-10 self-center">
        <OverflowMenu
          label={item.key ?? item.title}
          triggerLabel={t('specs.rowActions', { title: item.title })}
        >
          <MenuItem
            leadingIcon="file"
            disabled={!onOpenTarget}
            onSelect={() => onOpenTarget?.(target)}
          >
            {t('specs.openDetails')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled leadingIcon="archive">
            {t('specs.archiveUnavailable')}
          </MenuItem>
          <MenuItem disabled leadingIcon="trash" tone="danger">
            {t('specs.deleteUnavailable')}
          </MenuItem>
        </OverflowMenu>
      </div>
    </li>
  );
}
