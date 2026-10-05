import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { groupTranslationKey, type SpecsOverviewProjection, type SteeringTarget } from './model';
import { activeRow, archiveRow } from './presentation';
import { SpecListRow } from './SpecListRow';
import { SpecGroupHeader } from './SpecGroupHeader';

export function SpecSteeringCollection({
  projection,
  onOpenTarget,
  specificationHref,
  searching = false,
}: {
  readonly projection: SpecsOverviewProjection;
  readonly onOpenTarget?: (target: SteeringTarget) => void;
  readonly specificationHref?: (id: string) => string;
  readonly searching?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  // Search overrides only rendered disclosure. Normal state remains the immutable
  // pre-search snapshot throughout every non-empty query, including zero matches.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  if (projection.collection === 'archive')
    return (
      <ul className="m-0 min-w-0 list-none divide-y divide-border-subtle p-0">
        {projection.items.map((item) => (
          <SpecListRow
            key={item.id}
            item={archiveRow(item)}
            specificationHref={specificationHref?.(item.id)}
            onOpenTarget={onOpenTarget}
          />
        ))}
      </ul>
    );
  return (
    <div className="grid min-w-0 gap-4">
      {projection.groups.map((group) => {
        const rows = projection.items.filter((item) => item.groupId === group.id);
        if (!rows.length) return null;
        const expanded = searching || !collapsed.has(group.id);
        const controls = id + '-' + group.id;
        return (
          <section className="min-w-0" key={group.id} aria-label={t(groupTranslationKey[group.id])}>
            <SpecGroupHeader
              label={t(groupTranslationKey[group.id])}
              count={rows.length}
              groupId={group.id}
              expanded={expanded}
              searching={searching}
              controls={controls}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.id)) next.delete(group.id);
                  else next.add(group.id);
                  return next;
                })
              }
            />
            <ul
              id={controls}
              hidden={!expanded}
              className="m-0 min-w-0 list-none divide-y divide-border-subtle p-0"
            >
              {rows.map((item) => (
                <SpecListRow
                  key={item.id}
                  item={activeRow(item)}
                  specificationHref={specificationHref?.(item.id)}
                  onOpenTarget={onOpenTarget}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
