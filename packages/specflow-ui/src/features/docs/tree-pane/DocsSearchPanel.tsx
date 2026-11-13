import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, Typography } from '@nevo/ui';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { useDocsSearch } from '../read-model';
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
 * that stays mounted and changes only its text, with the non-authoritative switch beside it) above
 * the results; otherwise `children` (the tree). Clearing returns focus to the field.
 */
export function DocsSearchPanel({
  workspaceId,
  nonAuthoritative,
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
  nonAuthoritative: ReadonlySet<string>;
  activeDocumentId?: string;
  onOpen: (documentId: string, sectionId?: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [includeNonAuthoritative, setIncludeNonAuthoritative] = useState(false);
  const [switchUsed, setSwitchUsed] = useState(false);

  // The search runs once typing pauses (a timer is the external system here).
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), searchDelayMs);

    return () => clearTimeout(timer);
  }, [text]);

  const searching = text.trim().length > 0;
  const search = useDocsSearch(searching && !hidden ? workspaceId : undefined, {
    q: query,
    includeNonAuthoritative,
  });
  const pending = search.isPending || query !== text.trim();
  const status = searchStatus(t, { search: search.data, pending, failed: search.isError });
  const leftOut = pending ? undefined : search.data?.nonAuthoritativeLeftOut;
  // One control that keeps its place (and focus) while its answer loads: "Leave out" while they
  // are included, "Include N" while some are left out.
  const switchShown = includeNonAuthoritative || (leftOut ?? 0) > 0 || (pending && switchUsed);
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
            {switchShown && (
              <Button
                variant="ghost"
                size="sm"
                className="-mr-2"
                aria-disabled={pending || undefined}
                onClick={() => {
                  if (!pending) {
                    setSwitchUsed(true);
                    setIncludeNonAuthoritative(!includeNonAuthoritative);
                  }
                }}
              >
                {includeNonAuthoritative
                  ? t('docs.search.leaveOut')
                  : leftOut === undefined
                    ? t('docs.search.includeAny')
                    : t('docs.search.include', { count: leftOut })}
              </Button>
            )}
          </div>
          <DocsSearchResults
            search={search.data}
            pending={pending}
            failed={search.isError}
            nonAuthoritative={nonAuthoritative}
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
