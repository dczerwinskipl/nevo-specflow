import { ArchetypeAvailabilityHelp } from '../ArchetypeAvailabilityHelp';
import { Button, EmptyState, type IconGlyph } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SpecsCollection } from './model';
import { useMessage, type Message } from '../../../i18n/message';
import { productIcons } from '../../../shared/product-icons';

const kindIcon: Record<'noResults' | 'emptyCurrent' | 'emptyArchive', IconGlyph> = {
  noResults: 'search',
  emptyCurrent: productIcons.specification.collection,
  emptyArchive: 'archive',
};

/** No rows to show: nothing matches the search, or the collection itself is empty. */
export function SpecsOverviewEmpty({
  collection,
  searching,
  onClearSearch,
  onCreate,
  createDisabled,
  creationPrerequisite,
  creationRefreshing,
  onRefreshCreation,
}: {
  readonly collection: SpecsCollection;
  readonly searching: boolean;
  readonly onClearSearch: () => void;
  readonly onCreate?: () => void;
  readonly createDisabled: boolean;
  readonly creationPrerequisite?: Message;
  readonly creationRefreshing?: boolean;
  readonly onRefreshCreation?: () => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const kind = searching ? 'noResults' : collection === 'current' ? 'emptyCurrent' : 'emptyArchive';
  const prerequisite = kind === 'emptyCurrent' ? creationPrerequisite : undefined;

  return (
    <EmptyState
      variant="pane"
      icon={kindIcon[kind]}
      title={t(`specifications.${kind}`)}
      description={prerequisite ? text(prerequisite) : t(`specifications.${kind}Description`)}
      actions={
        searching ? (
          <Button variant="secondary" onClick={onClearSearch}>
            {t('common.clearSearch')}
          </Button>
        ) : onCreate && collection === 'current' ? (
          <>
            <Button leadingIcon="plus" disabled={createDisabled} onClick={onCreate}>
              {t('specifications.create')}
            </Button>
            <ArchetypeAvailabilityHelp problem={prerequisite} />
            {prerequisite && onRefreshCreation && (
              <Button variant="secondary" disabled={creationRefreshing} onClick={onRefreshCreation}>
                {creationRefreshing ? t('common.refreshing') : t('common.refresh')}
              </Button>
            )}
          </>
        ) : undefined
      }
    />
  );
}
