import { InformationList, Progress, Typography, cn } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import {
  rowMetadata,
  rowProgress,
  type SpecRowModel,
  type CurrentSpecRowModel,
  type ArchiveSpecRowModel,
} from '../presentation';
import type { CurrentSpecTarget } from '../model';
import { SpecRowSummary } from './SpecRowSummary';
import { SpecPrimaryLink, type RenderSpecificationLink } from './SpecPrimaryLink';
import { SpecPullRequests } from './SpecPullRequests';
import { specRowColumns } from './specRowColumns';
import { formatSpecDate } from './specDate';

export interface SpecListRowProps {
  readonly item: SpecRowModel;
  /**
   * `flat`: the list has no work status (the Runtime does not provide it): the row is the title,
   * its facts including when it was updated and, only when it exists, the progress; no empty
   * situation column. Default `grouped`: title, situation and progress.
   */
  readonly layout?: 'grouped' | 'flat';
  /** Flat layout only: the list has progress, so the row keeps its progress column. */
  readonly showProgress?: boolean;
  readonly specificationHref?: string;
  readonly onOpenTarget?: (target: CurrentSpecTarget) => void;
  readonly renderSpecificationLink?: RenderSpecificationLink;
}

export function SpecListRow({
  item,
  layout = 'grouped',
  showProgress = false,
  specificationHref,
  onOpenTarget,
  renderSpecificationLink,
}: SpecListRowProps) {
  const flat = layout === 'flat' && item.collection === 'current';
  const primary = (
    <SpecPrimaryLink
      specId={item.id}
      title={item.title}
      href={specificationHref}
      onOpenTarget={onOpenTarget}
      renderLink={renderSpecificationLink}
    />
  );
  return (
    <InformationList.Item
      interactive={
        Boolean(specificationHref) || Boolean(onOpenTarget) || Boolean(renderSpecificationLink)
      }
      className="py-3"
      data-spec-id={item.id}
      data-spec-key={item.key}
    >
      <InformationList.Content>
        <div
          className={cn(
            'grid min-w-0 gap-x-6 gap-y-2',
            flat
              ? showProgress
                ? specRowColumns.flatWithProgress.row
                : undefined
              : specRowColumns[item.collection].row,
          )}
        >
          <SpecRowIdentity item={item} primary={primary} flat={flat} />
          {item.collection === 'archive' ? (
            <ArchivedSpecRowContent item={item} />
          ) : flat ? (
            showProgress ? (
              <SpecProgress item={item} column={2} />
            ) : null
          ) : (
            <CurrentSpecRowContent item={item} />
          )}
        </div>
      </InformationList.Content>
    </InformationList.Item>
  );
}

function SpecRowIdentity({
  item,
  primary,
  flat,
}: {
  item: SpecRowModel;
  primary: ReactNode;
  flat: boolean;
}) {
  const { t, i18n } = useTranslation();
  const facts = rowMetadata(item, { updated: flat });
  return (
    <div className="min-w-0">
      <Typography
        as={item.collection === 'current' && !flat ? 'h3' : 'h2'}
        variant="title-sm"
        className="min-w-0 text-content-primary"
        data-spec-title
      >
        {primary}
      </Typography>
      {facts.length ? (
        <Typography
          as="div"
          variant="body-sm"
          className={cn(
            'mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-content-secondary [overflow-wrap:anywhere]',
            item.collection === 'current' &&
              item.pullRequests?.kind === 'single' &&
              '[@media(pointer:coarse)]:items-start',
          )}
          data-spec-metadata
        >
          {facts.map((fact, index) => (
            <span key={fact.id} className="contents">
              {index ? <span aria-hidden="true">·</span> : null}
              {fact.kind === 'key' ? (
                <span className="font-mono" data-spec-key>
                  {fact.value}
                </span>
              ) : fact.kind === 'pr' ? (
                <span>
                  <SpecPullRequests item={item} />
                </span>
              ) : fact.kind === 'updated' ? (
                <time dateTime={fact.value}>
                  {t('specifications.updated', {
                    date: formatSpecDate(fact.value, i18n.resolvedLanguage),
                  })}
                </time>
              ) : (
                <span>{fact.value}</span>
              )}
            </span>
          ))}
        </Typography>
      ) : null}
    </div>
  );
}
function SpecProgress({ item, column = 3 }: { item: CurrentSpecRowModel; column?: 2 | 3 }) {
  const { t } = useTranslation();
  const details = item.progress;
  const count = details
    ? t('specifications.progress', details)
    : t('specifications.progressUnknown');
  const progress = rowProgress(details);
  return (
    <Typography
      as="div"
      variant="body-sm"
      className={cn(
        'flex min-w-0 items-center gap-2 text-content-secondary @min-[48rem]/collection:row-start-1 @min-[48rem]/collection:flex-col @min-[48rem]/collection:items-start',
        column === 3
          ? '@min-[48rem]/collection:col-start-3'
          : '@min-[48rem]/collection:col-start-2',
      )}
      data-spec-progress
    >
      {progress === 'unknown' ? (
        t('specifications.progressUnknown')
      ) : progress === 'invalid' ? (
        t('specifications.invalidProgress')
      ) : progress === 'empty' ? (
        t('specifications.noTasks')
      ) : details ? (
        <>
          <div className="w-28 shrink-0">
            <Progress
              variant="segmented"
              size="compact"
              completed={details.completed}
              total={details.total}
              aria-label={t('specifications.progressLabel', { title: item.title })}
              aria-valuetext={count}
            />
          </div>
          <span>{count}</span>
        </>
      ) : null}
    </Typography>
  );
}
function CurrentSpecRowContent({ item }: { item: CurrentSpecRowModel }) {
  return (
    <>
      <SpecProgress item={item} />
      <Typography
        as="div"
        variant="body-sm"
        className="min-w-0 @min-[48rem]/collection:col-start-2 @min-[48rem]/collection:row-start-1"
        data-spec-summary
      >
        <SpecRowSummary item={item} />
      </Typography>
    </>
  );
}
function ArchivedSpecRowContent({ item }: { item: ArchiveSpecRowModel }) {
  return (
    <>
      <Typography
        as="div"
        variant="body-sm"
        className="min-w-0 text-content-secondary"
        data-spec-summary
      >
        <SpecRowSummary item={item} />
      </Typography>
      <Typography
        as="div"
        variant="body-sm"
        className={cn(
          'min-w-0 text-content-secondary',
          !item.pullRequests && 'hidden @min-[48rem]/collection:block',
        )}
      >
        <SpecPullRequests item={item} />
      </Typography>
    </>
  );
}
