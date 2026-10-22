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
import { SpecSectionHeader } from './SpecSectionHeader';
import { SpecListRow } from './SpecListRow';
import type { RenderSpecificationLink } from './SpecPrimaryLink';
import { specRowColumns } from './specRowColumns';

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

  if (projection.collection === 'archive') {
    return (
      <div className="@container/collection min-w-0">
        {projection.items.length ? (
          <Typography variant="body-sm" className="mb-3 text-content-secondary">
            {t('specifications.newestMilestoneFirst')}
          </Typography>
        ) : null}
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
    if (!projection.items.length) return null;
    // No work status: one flat list of specifications, not one group of "unavailable" with empty columns.
    return (
      <div className="@container/collection grid min-w-0 gap-2" data-spec-layout="flat">
        {provided.progress ? <OverviewColumns flat /> : null}
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

function OverviewColumns({ archive = false, flat = false }: { archive?: boolean; flat?: boolean }) {
  const { t } = useTranslation();
  return (
    <Typography
      as="div"
      variant="body-sm"
      aria-hidden="true"
      data-spec-columns
      className={cn(
        'hidden min-w-0 gap-x-6 px-2 text-content-secondary',
        specRowColumns[archive ? 'archive' : flat ? 'flatWithProgress' : 'current'].header,
      )}
    >
      <span>{t('specifications.specificationColumn')}</span>
      {flat ? null : (
        <span>
          {t(archive ? 'specifications.milestoneColumn' : 'specifications.situationColumn')}
        </span>
      )}
      <span>
        {t(archive ? 'specifications.pullRequestColumn' : 'specifications.progressColumn')}
      </span>
    </Typography>
  );
}
