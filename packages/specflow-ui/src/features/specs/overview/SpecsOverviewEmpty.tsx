import { Button, EmptyState } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecsCollection } from './model';

/** No rows to show: nothing matches the search, or the collection itself is empty. */
export function SpecsOverviewEmpty({
  collection,
  searching,
  onClearSearch,
  onCreate,
}: {
  readonly collection: SpecsCollection;
  readonly searching: boolean;
  readonly onClearSearch: () => void;
  readonly onCreate?: () => void;
}) {
  const { t } = useTranslation();
  const kind = searching ? 'noResults' : collection === 'current' ? 'emptyCurrent' : 'emptyArchive';
  return (
    <EmptyState
      className="border-0"
      title={t(`specifications.${kind}`)}
      description={t(`specifications.${kind}Description`)}
      actions={
        searching ? (
          <Button variant="secondary" onClick={onClearSearch}>
            {t('specifications.clearSearch')}
          </Button>
        ) : onCreate && collection === 'current' ? (
          <Button leadingIcon="plus" onClick={onCreate}>
            {t('specifications.create')}
          </Button>
        ) : undefined
      }
    />
  );
}
