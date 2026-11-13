import { useTranslation } from 'react-i18next';
import { Button, EmptyState, cn, treeStateLabelClassName } from '@nevo/ui';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { TreeSkeleton } from './TreeSkeleton';

/** The index-building progress of a lexical answer, in whole percent; `undefined` when unknown. */
export function indexBuildingPercent(search: WorkspaceDocsSearch): number | undefined {
  const progress = search.indexProgress;
  if (!progress || progress.total <= 0) {
    return undefined;
  }

  return Math.min(100, Math.floor((progress.embedded / progress.total) * 100));
}

/**
 * The rows of a search, replacing the tree while the field has text: one row per document (title,
 * the best section's heading path, its excerpt). The count, the index line and the
 * non-authoritative switch are the search's status row above (`DocsSearchPanel`).
 */
export function DocsSearchResults({
  search,
  pending,
  failed,
  nonAuthoritative,
  activeDocumentId,
  onClear,
  onRetry,
  onOpen,
}: {
  search?: WorkspaceDocsSearch;
  pending: boolean;
  failed: boolean;
  /** Ids of the tree's non-authoritative documents (the hits carry no flag of their own). */
  nonAuthoritative: ReadonlySet<string>;
  activeDocumentId?: string;
  onClear: () => void;
  onRetry: () => void;
  onOpen: (documentId: string, sectionId?: string) => void;
}) {
  const { t } = useTranslation();
  if (failed) {
    return (
      <div className="px-1">
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (!search || pending) {
    // The search's status row already announces it.
    return <TreeSkeleton />;
  }

  if (search.results.length === 0) {
    return (
      <div className="px-2">
        <EmptyState
          variant="inline"
          icon="search"
          title={t('docs.search.noMatches')}
          description={
            search.nonAuthoritativeLeftOut > 0
              ? t('docs.search.onlyNonAuthoritative', { count: search.nonAuthoritativeLeftOut })
              : t('docs.search.noMatchesHint')
          }
          actions={
            <Button variant="secondary" size="sm" onClick={onClear}>
              {t('docs.search.clear')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <section aria-label={t('docs.search.results')}>
      <ul className="m-0 grid list-none gap-0.5 p-0">
        {search.results.map((hit) => {
          const section = hit.sections[0];

          return (
            <li key={hit.id}>
              <button
                type="button"
                aria-current={hit.id === activeDocumentId ? 'page' : undefined}
                onClick={() => onOpen(hit.id, section?.sectionId)}
                className={cn(
                  'grid w-full min-w-0 gap-0.5 rounded-control px-2 py-2 text-left outline-none',
                  'hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring',
                  'aria-[current=page]:bg-surface-selected',
                )}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="line-clamp-2 min-w-0 flex-1 text-title-sm text-content-primary">
                    {hit.title}
                  </span>
                  {nonAuthoritative.has(hit.id) && (
                    <span className={treeStateLabelClassName}>
                      {t('docs.tree.nonAuthoritative')}
                    </span>
                  )}
                </span>
                {section && section.headingPath.length > 0 && (
                  <span className="truncate text-body-sm text-content-secondary">
                    {section.headingPath.join(' › ')}
                  </span>
                )}
                {section?.snippet && (
                  <span className="line-clamp-2 text-body-sm text-content-muted">
                    {section.snippet}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
