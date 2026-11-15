import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckboxField, Field, InlineNote, TextInput, Typography } from '@nevo/ui';
import { useAppServices } from '../../../../app/useAppServices';
import { taskAuthoringKeys } from '../queries';

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
    <div className="grid gap-3">
      <Field>
        <Field.Label>{t('taskAuthoring.context.searchLabel')}</Field.Label>
        <TextInput type="search" value={term} onChange={(event) => setTerm(event.target.value)} />
      </Field>
      {search.isFetching ? (
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
      ) : null}
      {results.length > 0 ? (
        <fieldset className="grid gap-3">
          <legend className="sr-only">{t('taskAuthoring.context.results')}</legend>
          {results.map((result) => {
            const inContext = added(result.id);

            return (
              <CheckboxField
                key={result.id}
                label={result.title}
                description={[
                  result.id,
                  inContext ? t('taskAuthoring.context.alreadyInContext') : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                checked={inContext || picked.includes(result.id)}
                disabled={inContext}
                onCheckedChange={(checked) => onToggle(result.id, checked === true)}
              />
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
