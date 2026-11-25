import { InformationList, Progress, Typography, cn } from '@nevo/ui';
import {
  CollectionRow,
  collectionWide,
  type CollectionTracks,
} from '../../../../shared/operational-list';
import { useTranslation } from 'react-i18next';
import type { CSSProperties, ReactNode } from 'react';
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
import { formatSpecDate } from './specDate';

/** The Overview's done fill of the Task progress bar (`SpecificationNow`). */
const doneFill = { '--color-progress-fill': 'var(--color-status-success)' } as CSSProperties;

export interface SpecListRowProps {
  readonly item: SpecRowModel;
  /**
   * `flat`: the list has no work status (the Runtime does not provide it): the row is the title
   * with its facts, when it was last updated (a column of its own from 48rem) and, only when it
   * exists, the progress; no empty situation column. Default `grouped`: title, situation and
   * progress.
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
      className="py-2.5"
      data-spec-id={item.id}
      data-spec-key={item.key}
    >
      <InformationList.Content>
        <CollectionRow tracks={specRowTracks(item, flat, showProgress)}>
          <SpecRowIdentity item={item} primary={primary} flat={flat} />
          {item.collection === 'archive' ? (
            <ArchivedSpecRowContent item={item} />
          ) : flat ? (
            <>
              <SpecUpdated item={item} />
              {showProgress ? <SpecProgress item={item} /> : null}
            </>
          ) : (
            <CurrentSpecRowContent item={item} />
          )}
        </CollectionRow>
      </InformationList.Content>
    </InformationList.Item>
  );
}

/** The collection tracks of a row: the same choice the list makes for its column header. */
export function specRowTracks(
  item: Pick<SpecRowModel, 'collection'>,
  flat: boolean,
  showProgress: boolean,
): CollectionTracks {
  if (item.collection === 'archive') {
    return 'specificationArchive';
  }

  return flat
    ? showProgress
      ? 'specificationFlatWithProgress'
      : 'specificationFlat'
    : 'specification';
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
  const facts = rowMetadata(item);

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
          className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-content-secondary [overflow-wrap:anywhere]"
          data-spec-metadata
        >
          {facts.map((fact, index) => (
            <span key={fact.id} className="contents">
              {index ? <span aria-hidden="true">·</span> : null}
              {fact.kind === 'key' ? (
                <span className="font-mono text-content-muted" data-spec-key>
                  {fact.value}
                </span>
              ) : fact.kind === 'pr' ? (
                <span>
                  <SpecPullRequests item={item} />
                </span>
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

/**
 * When the specification last changed, in the flat list: one line under the title on narrow rows,
 * its own column from 48rem, where the column header names it (the full phrase stays readable to
 * assistive technology, which does not see the header).
 */
function SpecUpdated({ item }: { item: CurrentSpecRowModel }) {
  const { t, i18n } = useTranslation();
  const updatedAt = item.updatedAt;
  const date =
    updatedAt && Number.isFinite(Date.parse(updatedAt))
      ? formatSpecDate(updatedAt, i18n.resolvedLanguage)
      : undefined;

  return (
    <Typography
      as="div"
      variant="body-sm"
      className={cn('min-w-0 text-content-secondary', collectionWide.column2)}
      data-spec-updated
    >
      {date ? (
        <time dateTime={updatedAt}>
          <span className={collectionWide.srOnly}>{t('specifications.updated', { date })}</span>
          <span aria-hidden="true" className={collectionWide.inline}>
            {date}
          </span>
        </time>
      ) : (
        t('specifications.dateUnavailable')
      )}
    </Typography>
  );
}

function SpecProgress({ item }: { item: CurrentSpecRowModel }) {
  const { t } = useTranslation();
  const details = item.progress;
  // The Overview's words and bar for the same count (`taskOverview.progress.tasksDone`).
  const count = details
    ? t('taskOverview.progress.tasksDone', details)
    : t('specifications.progressUnknown');
  const progress = rowProgress(details);

  return (
    <Typography
      as="div"
      variant="body-sm"
      className={cn(
        'flex min-w-0 items-center gap-2 text-content-secondary',
        collectionWide.column3,
        collectionWide.flexColumn,
        collectionWide.itemsStart,
      )}
      data-spec-progress
    >
      {progress === 'unknown' ? (
        t('specifications.progressUnknown')
      ) : progress === 'invalid' ? (
        t('specifications.invalidProgress')
      ) : progress === 'empty' ? (
        // Not a final state: the tasks are not written yet. Muted, in the place of the bar.
        <span className="text-content-muted" data-spec-progress-empty>
          {t('specifications.noTasks')}
        </span>
      ) : details ? (
        <>
          {/* One continuous bar, as the Overview's Task progress: never a second segmented track. */}
          <div className="w-20 shrink-0">
            <Progress
              value={details.completed}
              max={details.total}
              style={doneFill}
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
        className={cn('min-w-0', collectionWide.column2)}
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
        className={cn('min-w-0 text-content-secondary', !item.pullRequests && collectionWide.block)}
      >
        <SpecPullRequests item={item} />
      </Typography>
    </>
  );
}
