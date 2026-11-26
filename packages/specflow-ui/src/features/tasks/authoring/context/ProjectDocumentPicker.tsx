import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { InlineNote, Typography } from '@nevo/ui';
import { useAppServices } from '../../../../app/useAppServices';
import { taskAuthoringKeys } from '../queries';
import { ItemPicker } from '../picker/ItemPicker';

/** Searches the project documentation (`/api/docs/search`) and lets the person tick documents. */
export function ProjectDocumentPicker({
  picked,
  added,
  onToggle,
}: {
  readonly picked: readonly string[];
  readonly added: (id: string) => boolean;
  readonly onToggle: (id: string, checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const { taskAuthoringApi } = useAppServices();
  const [term, setTerm] = useState('');
  // Typing does not start a search per keystroke: the deferred value settles first.
  const query = useDeferredValue(term.trim());
  const search = useQuery({
    queryKey: taskAuthoringKeys.projectDocuments(query),
    queryFn: ({ signal }) => taskAuthoringApi.searchProjectDocuments(query, signal),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const results = search.data?.results ?? [];

  return (
    // The shared picker; the search is the server's, so the picker shows the results as given.
    <ItemPicker
      items={results.map((result) => ({
        id: result.id,
        title: result.title,
        description: result.id,
        ...(added(result.id)
          ? { unavailable: t('taskAuthoring.context.alreadyInContext'), added: true }
          : {}),
      }))}
      picked={picked}
      onToggle={onToggle}
      query={term}
      onQueryChange={setTerm}
      status={
        search.isFetching ? (
          <Typography as="p" role="status" variant="body-sm" className="text-content-muted">
            {t('taskAuthoring.context.searching')}
          </Typography>
        ) : search.isError ? (
          <InlineNote tone="attention" role="alert">
            {t('taskAuthoring.context.searchFailed')}
          </InlineNote>
        ) : search.isSuccess && results.length === 0 ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('taskAuthoring.context.noResults')}
          </Typography>
        ) : null
      }
      labels={{
        available: t('taskAuthoring.context.results'),
        unavailable: t('taskAuthoring.picker.unavailableDocuments'),
        noneAvailable: t('taskAuthoring.context.noneAvailable'),
        search: t('taskAuthoring.context.searchLabel'),
      }}
    />
  );
}
