import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Typography } from '@nevo/ui';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { useDocsSearch } from '../read-model';
import { DocsProposalsFilter } from './DocsProposalsFilter';
import { DocsSearchField } from './DocsSearchField';
import { DocsSearchResults, indexBuildingPercent } from './DocsSearchResults';

const searchDelayMs = 250;

/**
 * What the search's status row says: the count, or that nothing matches, or that it is
 * searching or failed; then, while the index is being built, the word-match line. `announced`
 * lines are read out but not shown (the empty state and the skeleton already show them).
 */
export function searchStatus(
  t: TFunction,
  input: { search?: WorkspaceDocsSearch; pending: boolean; failed: boolean },
): { readonly shown: string[]; readonly announced: string[] } {
  const { search, pending, failed } = input;
  if (failed) {
    return { shown: [t('docs.search.failed')], announced: [] };
  }

  if (!search || pending) {
    return { shown: [], announced: [t('docs.search.loading')] };
  }

  const building =
    search.mode === 'lexical' && search.reason.code === 'index-building'
      ? [
          indexBuildingPercent(search) === undefined
            ? t('docs.search.indexBuilding')
            : t('docs.search.indexBuildingProgress', { percent: indexBuildingPercent(search) }),
        ]
      : [];

  return search.results.length === 0
    ? { shown: building, announced: [t('docs.search.noMatches')] }
    : {
        shown: [t('docs.search.count', { count: search.results.length }), ...building],
        announced: [],
      };
}

/**
 * The search of the tree pane: the field, and while it has text one status row (a live region
 * that stays mounted and changes only its text, with the proposals checkbox beside it) above
 * the results; otherwise `children` (the tree). Clearing returns focus to the field.
 */
export function DocsSearchPanel({
  workspaceId,
  proposals,
  activeDocumentId,
  onOpen,
  hidden = false,
  children,
}: {
  /**
   * The workspace's documentation has a problem: nothing is shown, but the panel stays mounted so
   * the search text survives until another workspace is picked.
   */
  hidden?: boolean;
  workspaceId: string | undefined;
  proposals: ReadonlySet<string>;
  activeDocumentId?: string;
  onOpen: (documentId: string, sectionId?: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [includeProposals, setIncludeProposals] = useState(false);
  const [filterUsed, setFilterUsed] = useState(false);

  // The search runs once typing pauses (a timer is the external system here).
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), searchDelayMs);

    return () => clearTimeout(timer);
  }, [text]);

  const searching = text.trim().length > 0;
  const search = useDocsSearch(searching && !hidden ? workspaceId : undefined, {
    q: query,
    includeProposals,
  });
  const pending = search.isPending || query !== text.trim();
  const status = searchStatus(t, { search: search.data, pending, failed: search.isError });
  const answer = pending ? undefined : search.data;
  // The proposals the answer included, or those it left out; the checkbox shows that number.
  const proposalCount =
    answer === undefined
      ? undefined
      : includeProposals
        ? answer.results.filter((hit) => proposals.has(hit.id)).length
        : answer.proposalsLeftOut;
  // One control that keeps its place (and focus) while its answer loads: shown while proposals
  // are included or some are left out, and while the answer to its own change loads.
  const filterShown = includeProposals || (proposalCount ?? 0) > 0 || (pending && filterUsed);
  const clear = () => {
    setText('');
    setQuery('');
    field.current?.focus();
  };

  if (hidden) {
    return null;
  }

  return (
    <>
      <DocsSearchField ref={field} value={text} onChange={setText} onClear={clear} />
      {searching ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2">
            <div role="status" className="grid min-w-0 gap-0.5">
              {status.shown.map((line) => (
                <Typography key={line} as="p" variant="body-sm" className="text-content-muted">
                  {line}
                </Typography>
              ))}
              {status.announced.map((line) => (
                <span key={line} className="sr-only">
                  {line}
                </span>
              ))}
            </div>
            {filterShown && (
              <DocsProposalsFilter
                checked={includeProposals}
                count={proposalCount}
                pending={pending}
                onCheckedChange={(checked) => {
                  setFilterUsed(true);
                  setIncludeProposals(checked);
                }}
              />
            )}
          </div>
          <DocsSearchResults
            search={search.data}
            pending={pending}
            failed={search.isError}
            proposals={proposals}
            activeDocumentId={activeDocumentId}
            onClear={clear}
            onRetry={() => void search.refetch()}
            onOpen={onOpen}
          />
        </>
      ) : (
        children
      )}
    </>
  );
}
