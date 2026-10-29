import { useId, useState } from 'react';
import { InformationList, Typography, cn } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import { sectionTranslationKey, type SpecsOverview, type CurrentSpecTarget } from './model';
import {
  archiveRow,
  currentRow,
  overviewCapabilities,
  sortArchiveItems,
  type OverviewCapabilities,
} from './presentation';
import { SpecSectionHeader } from './rows/SpecSectionHeader';
import { SpecListRow } from './rows/SpecListRow';
import type { RenderSpecificationLink } from './rows/SpecPrimaryLink';
import { specRowColumns } from './rows/specRowColumns';

export function SpecsOverviewCollection({
  projection,
  onOpenTarget,
  specificationHref,
  renderSpecificationLink,
  searching = false,
  capabilities,
}: {
  readonly projection: SpecsOverview;
  readonly onOpenTarget?: (target: CurrentSpecTarget) => void;
  readonly specificationHref?: (id: string) => string;
  readonly renderSpecificationLink?: RenderSpecificationLink;
  readonly searching?: boolean;
  /**
   * What the Runtime really provides, decided from the whole collection (not from a search
   * result). Without work status the current list is flat: no groups of "unavailable". Defaults to
   * what `projection` itself provides.
   */
  readonly capabilities?: OverviewCapabilities;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  // No rows: the empty state stands alone, without column headers that describe no row.
  if (!projection.items.length) return null;

  if (projection.collection === 'archive') {
    return (
      <div className="@container/collection min-w-0">
        <Typography variant="body-sm" className="mb-3 text-content-secondary">
          {t('specifications.newestMilestoneFirst')}
        </Typography>
        <OverviewColumns archive />
        <InformationList>
          {sortArchiveItems(projection.items).map((item) => (
            <SpecListRow
              key={item.id}
              item={archiveRow(item)}
              specificationHref={specificationHref?.(item.id)}
              onOpenTarget={onOpenTarget}
              renderSpecificationLink={renderSpecificationLink}
            />
          ))}
        </InformationList>
      </div>
    );
  }

  const provided = capabilities ?? overviewCapabilities(projection);
  if (!provided.status) {
    // No work status: one flat list of specifications, not one group of "unavailable" with empty columns.
    return (
      <div className="@container/collection grid min-w-0 gap-2" data-spec-layout="flat">
        <OverviewColumns flat progress={provided.progress} />
        <InformationList aria-label={t('specifications.title')}>
          {projection.items.map((item) => (
            <SpecListRow
              key={item.id}
              item={currentRow(item)}
              layout="flat"
              showProgress={provided.progress}
              specificationHref={specificationHref?.(item.id)}
              onOpenTarget={onOpenTarget}
              renderSpecificationLink={renderSpecificationLink}
            />
          ))}
        </InformationList>
      </div>
    );
  }

  return (
    <div
      className="@container/collection grid min-w-0 gap-5 @min-[40rem]/collection:gap-6"
      data-spec-layout="grouped"
    >
      <OverviewColumns />
      {projection.sections.map((section) => {
        const rows = projection.items.filter((item) => item.classification.section === section);
        if (!rows.length) return null;

        const expanded = searching || !collapsed.has(section);
        const controls = id + '-' + section;

        return (
          <section
            className="grid min-w-0 gap-2"
            key={section}
            aria-label={t(sectionTranslationKey[section])}
          >
            <SpecSectionHeader
              label={t(sectionTranslationKey[section])}
              count={rows.length}
              sectionId={section}
              expanded={expanded}
              searching={searching}
              controls={controls}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(section)) next.delete(section);
                  else next.add(section);
                  return next;
                })
              }
            />
            {expanded ? (
              <InformationList id={controls}>
                {rows.map((item) => (
                  <SpecListRow
                    key={item.id}
                    item={currentRow(item)}
                    specificationHref={specificationHref?.(item.id)}
                    onOpenTarget={onOpenTarget}
                    renderSpecificationLink={renderSpecificationLink}
                  />
                ))}
              </InformationList>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function OverviewColumns({
  archive = false,
  flat = false,
  progress = true,
}: {
  archive?: boolean;
  flat?: boolean;
  /** Flat list only: whether the progress column exists. */
  progress?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Typography
      as="div"
      variant="body-sm"
      aria-hidden="true"
      data-spec-columns
      className={cn(
        'hidden min-w-0 gap-x-6 px-2 text-content-secondary',
        specRowColumns[
          archive ? 'archive' : flat ? (progress ? 'flatWithProgress' : 'flat') : 'current'
        ].header,
      )}
    >
      <span>{t('specifications.specificationColumn')}</span>
      <span>
        {t(
          archive
            ? 'specifications.milestoneColumn'
            : flat
              ? 'specifications.updatedColumn'
              : 'specifications.situationColumn',
        )}
      </span>
      {progress ? (
        <span>
          {t(archive ? 'specifications.pullRequestColumn' : 'specifications.progressColumn')}
        </span>
      ) : null}
    </Typography>
  );
}
