import { useTranslation } from 'react-i18next';

import {
  steeringGroups,
  type SpecRowSelection,
  type SpecsOverviewProjection,
  type SteeringTarget,
} from './model';
import { SpecListRow } from './SpecListRow';
import { SpecGroupHeader } from './SpecGroupHeader';

export function SpecSteeringCollection({
  projection,
  onOpenTarget,
  selectionFor,
}: {
  readonly projection: SpecsOverviewProjection;
  readonly onOpenTarget?: (target: SteeringTarget) => void;
  readonly selectionFor?: (specId: string) => SpecRowSelection;
}) {
  const { t } = useTranslation();
  const groups =
    projection.collection === 'archive'
      ? [
          {
            kind: 'quiet' as const,
            items: [...projection.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          },
        ]
      : steeringGroups(projection.items);

  return (
    <div className="grid min-w-0 gap-2">
      {groups.map((group) => (
        <details
          className="group/section min-w-0"
          key={group.kind}
          open
          aria-label={
            projection.collection === 'archive'
              ? t('specs.archive')
              : t(`specs.groups.${group.kind}`)
          }
        >
          <SpecGroupHeader
            label={
              projection.collection === 'archive'
                ? t('specs.archive')
                : t(`specs.groups.${group.kind}`)
            }
            count={group.items.length}
            kind={projection.collection === 'active' ? group.kind : undefined}
          />
          <ul className="m-0 list-none divide-y divide-border-subtle p-0">
            {group.items.map((item) => (
              <SpecListRow
                archived={projection.collection === 'archive'}
                item={item}
                key={item.id}
                onOpenTarget={onOpenTarget}
                selection={selectionFor?.(item.id)}
              />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
