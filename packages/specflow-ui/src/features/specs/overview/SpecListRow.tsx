import {
  InformationList,
  MenuItem,
  MenuSeparator,
  OverflowMenu,
  Progress,
  Typography,
  cn,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import {
  rowMetadata,
  rowProgress,
  type SpecRowModel,
  type CurrentSpecRowModel,
  type ArchiveSpecRowModel,
} from './presentation';
import type { CurrentSpecTarget } from './model';
import { SpecRowSummary } from './SpecRowSummary';
import { SpecPrimaryLink, type RenderSpecificationLink } from './SpecPrimaryLink';
import { SpecPullRequests } from './SpecPullRequests';
import { specRowColumns } from './specRowColumns';

export interface SpecListRowProps {
  readonly item: SpecRowModel;
  readonly specificationHref?: string;
  readonly onOpenTarget?: (target: CurrentSpecTarget) => void;
  readonly renderSpecificationLink?: RenderSpecificationLink;
}

export function SpecListRow({
  item,
  specificationHref,
  onOpenTarget,
  renderSpecificationLink,
}: SpecListRowProps) {
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
        <div className={cn('grid min-w-0 gap-x-6 gap-y-2', specRowColumns[item.collection].row)}>
          <SpecRowIdentity item={item} primary={primary} />
          {item.collection === 'current' ? (
            <CurrentSpecRowContent item={item} />
          ) : (
            <ArchivedSpecRowContent item={item} />
          )}
        </div>
      </InformationList.Content>
      <SpecRowActions
        item={item}
        specificationHref={specificationHref}
        onOpenTarget={onOpenTarget}
      />
    </InformationList.Item>
  );
}

function SpecRowIdentity({ item, primary }: { item: SpecRowModel; primary: ReactNode }) {
  const facts = rowMetadata(item);
  return (
    <div className="min-w-0">
      <Typography
        as={item.collection === 'current' ? 'h3' : 'h2'}
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
function CurrentSpecRowContent({ item }: { item: CurrentSpecRowModel }) {
  const { t } = useTranslation();
  const details = item.progress;
  const count = details
    ? t('specifications.progress', details)
    : t('specifications.progressUnknown');
  const progress = rowProgress(details);
  return (
    <>
      <Typography
        as="div"
        variant="body-sm"
        className="flex min-w-0 items-center gap-2 text-content-secondary @min-[48rem]/collection:col-start-3 @min-[48rem]/collection:row-start-1 @min-[48rem]/collection:flex-col @min-[48rem]/collection:items-start"
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
function SpecRowActions({
  item,
  specificationHref,
  onOpenTarget,
}: Pick<SpecListRowProps, 'item' | 'specificationHref' | 'onOpenTarget'>) {
  const { t } = useTranslation();
  const target: CurrentSpecTarget = { kind: 'specification', specId: item.id };
  return (
    <InformationList.Trailing>
      <OverflowMenu
        className="min-h-11 min-w-11 @min-[48rem]/collection:min-h-control-height-default @min-[48rem]/collection:min-w-control-height-default"
        label={item.key ?? item.title}
        triggerLabel={t('specifications.rowActions', { title: item.title })}
      >
        <MenuItem
          leadingIcon="file"
          disabled={!onOpenTarget && !specificationHref}
          onSelect={() => {
            if (onOpenTarget) onOpenTarget(target);
            else if (specificationHref) window.location.assign(specificationHref);
          }}
        >
          {t('specifications.openDetails')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem disabled leadingIcon="archive">
          {t('specifications.archiveUnavailable')}
        </MenuItem>
        <MenuItem disabled leadingIcon="trash" tone="danger">
          {t('specifications.deleteUnavailable')}
        </MenuItem>
      </OverflowMenu>
    </InformationList.Trailing>
  );
}
