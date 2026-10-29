import { Button, EmptyState, type IconName } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecsCollection } from './model';

const kindIcon: Record<'noResults' | 'emptyCurrent' | 'emptyArchive', IconName> = {
  noResults: 'search',
  emptyCurrent: 'file',
  emptyArchive: 'archive',
};

/** No rows to show: nothing matches the search, or the collection itself is empty. */
export function SpecsOverviewEmpty({
  collection,
  searching,
  onClearSearch,
  onCreate,
  createDisabled,
}: {
  readonly collection: SpecsCollection;
  readonly searching: boolean;
  readonly onClearSearch: () => void;
  readonly onCreate?: () => void;
  readonly createDisabled: boolean;
}) {
  const { t } = useTranslation();
  const kind = searching ? 'noResults' : collection === 'current' ? 'emptyCurrent' : 'emptyArchive';

  return (
    <EmptyState
      variant="pane"
      icon={kindIcon[kind]}
      title={t(`specifications.${kind}`)}
      description={t(`specifications.${kind}Description`)}
      actions={
        searching ? (
          <Button variant="secondary" onClick={onClearSearch}>
            {t('specifications.clearSearch')}
          </Button>
        ) : onCreate && collection === 'current' ? (
          <Button leadingIcon="plus" disabled={createDisabled} onClick={onCreate}>
            {t('specifications.create')}
          </Button>
        ) : undefined
      }
    />
  );
}
