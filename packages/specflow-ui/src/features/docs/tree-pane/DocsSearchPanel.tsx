import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { useDocsSearch } from '../read-model';
import { TreeSearchField } from '../../../shared/document-tree';
import {
  docsReaderSearch,
  readerSearchMaxLength,
  type DocsReaderSearch,
} from '../reader/readerSearch';
import { DocsProposalsFilter } from './DocsProposalsFilter';
import { DocsSearchResults } from './DocsSearchResults';
import { answerAnnouncement, answerLines } from './searchStatusModel';
import { useSearchWaiting } from './useSearchWaiting';

const searchDelayMs = 250;

/** An answer as it was asked for: its workspace and whether it included proposals. */
interface HeldAnswer {
  readonly workspaceId: string;
  readonly includeProposals: boolean;
  readonly search: WorkspaceDocsSearch;
}

/** The proposals the answer included, or those it left out: the checkbox's number. */
function proposalCount(answer: HeldAnswer, proposals: ReadonlySet<string>): number {
  return answer.includeProposals
    ? answer.search.results.filter((hit) => proposals.has(hit.id)).length
    : answer.search.proposalsLeftOut;
}

/**
 * The search of the tree pane: the field, and while it has text the status row (the count and the
 * proposals checkbox), its quiet lines and the results; otherwise `children` (the tree). Clearing
 * returns focus to the field.
 *
 * While an answer is awaited the screen follows the waiting timeline: for 400 ms nothing changes
 * (the earlier answer of the same workspace stays); then the count leaves and the earlier rows dim
 * (or the skeleton shows); after 2 s one line says search by meaning is being prepared. The answer
 * replaces everything at once. An earlier answer is never shown under another workspace.
 *
 * One hidden live region reads each settled answer once (the count or that nothing matches, with
 * its lines), the failure, and once the 2 s line; never a keystroke or the first 2 s of a wait.
 *
 * The search is in the address (`search`). The field is the source while typing: its text is
 * written once typing pauses, as a replace, so typing adds no history entry, and the search runs
 * for what the address holds. The address is the source on navigation: Back, Forward, a link or
 * another history entry set the field, except the address's answer to the field's own write.
 */
export function DocsSearchPanel({
  workspaceId,
  historyEntry,
  search: address,
  onSearchChange,
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
  /** The history entry of the address: a new one (Back, Forward, a push) takes its search. */
  historyEntry: string;
  /** The search the address holds. */
  search: DocsReaderSearch;
  /** Writes the search into the address (a replace). */
  onSearchChange: (search: DocsReaderSearch) => void;
  proposals: ReadonlySet<string>;
  activeDocumentId?: string;
  onOpen: (documentId: string, sectionId?: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const field = useRef<HTMLInputElement>(null);
  // What the address holds is what is searched for.
  const query = address.q ?? '';
  const includeProposals = address.proposals === 1;
  const [text, setText] = useState(query);
  const [filterUsed, setFilterUsed] = useState(false);
  // The text this field last wrote: the address coming back with it is the field's own write, not
  // a navigation, and must not overwrite what was typed since.
  const [written, setWritten] = useState<string>();
  const [seen, setSeen] = useState({ historyEntry, query });
  if (seen.historyEntry !== historyEntry || seen.query !== query) {
    const ownWrite = seen.historyEntry === historyEntry && written === query;
    setSeen({ historyEntry, query });
    setWritten(undefined);
    if (!ownWrite && text.trim() !== query) {
      setText(query);
    }
  }

  const typed = text.trim();
  const write = (q: string, proposals: boolean) => {
    setWritten(q);
    onSearchChange(docsReaderSearch(q, proposals));
  };

  // The text is written once typing pauses (a timer is the external system here). A navigation
  // sets the field to its address, which ends a pending write.
  useEffect(() => {
    if (typed === query) {
      return;
    }

    const timer = setTimeout(() => {
      setWritten(typed);
      onSearchChange(docsReaderSearch(typed, includeProposals));
    }, searchDelayMs);

    return () => clearTimeout(timer);
  }, [typed, query, includeProposals, historyEntry, onSearchChange]);

  const searching = typed.length > 0;
  const search = useDocsSearch(searching && !hidden ? workspaceId : undefined, {
    q: query,
    includeProposals,
  });
  const typing = query !== typed;
  const settled =
    !typing && search.isSuccess && workspaceId !== undefined
      ? { workspaceId, includeProposals, search: search.data }
      : undefined;
  const failed = searching && !typing && search.isError && !search.isFetching;
  const waiting = searching && !hidden && !settled && !failed;
  // The timeline runs from the request: typing more (the pause before the next request) restarts it.
  const stage = useSearchWaiting(
    waiting && !typing,
    `${workspaceId ?? ''}\n${query}\n${includeProposals}`,
  );

  // The last settled answer, kept for the wait of the next one; dropped when the field empties.
  const [held, setHeld] = useState<HeldAnswer>();
  if (settled && held?.search !== settled.search) {
    setHeld(settled);
  } else if (!searching && held) {
    setHeld(undefined);
  }

  // Never another workspace's answer, whatever is held.
  const previous = held?.workspaceId === workspaceId ? held : undefined;
  // What the status row and the rows show as current: the answer, or the earlier one while quiet.
  const shown = settled ?? (waiting && stage === 'quiet' ? previous : undefined);
  const dimmed =
    waiting && stage !== 'quiet' && previous !== undefined && previous.search.results.length > 0;
  const count = shown && proposalCount(shown, proposals);
  // One control that keeps its place (and focus) while its answer loads: shown while proposals are
  // included or some are left out, while the answer to its own change loads, and from 400 ms of a
  // wait when the earlier answer showed it (or there is none yet).
  const filterShown =
    includeProposals ||
    (count ?? 0) > 0 ||
    (waiting &&
      (filterUsed ||
        (stage !== 'quiet' && (previous === undefined || proposalCount(previous, proposals) > 0))));
  const lines = [
    ...(shown ? answerLines(t, shown.search) : []),
    ...(stage === 'preparing' ? [t('docs.search.preparing')] : []),
    ...(failed ? [t('docs.search.failed')] : []),
  ];
  const announcement = settled
    ? answerAnnouncement(t, settled.search)
    : failed
      ? t('docs.search.failed')
      : stage === 'preparing'
        ? t('docs.search.preparing')
        : '';
  const resultCount = shown && shown.search.results.length > 0 ? shown.search.results.length : 0;

  const clear = () => {
    setText('');
    write('', includeProposals);
    field.current?.focus();
  };

  if (hidden) {
    return null;
  }

  return (
    <>
      {/* Escape or the clear button empties the field and keeps focus there: the tree returns. */}
      <div role="search" className="px-1">
        <TreeSearchField
          inputRef={field}
          label={t('docs.search.label')}
          maxLength={readerSearchMaxLength}
          value={text}
          onChange={setText}
          onClear={clear}
        />
      </div>
      {searching ? (
        <>
          <div className="grid min-w-0 gap-1">
            {(resultCount > 0 || filterShown) && (
              // At least one target tall, so no hit area reaches into the field above.
              <div className="flex min-h-(--target-size) min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2">
                {resultCount > 0 && (
                  <Typography as="p" variant="body-sm" className="text-content-muted">
                    {t('docs.search.count', { count: resultCount })}
                  </Typography>
                )}
                {filterShown && (
                  <DocsProposalsFilter
                    checked={includeProposals}
                    count={count}
                    pending={waiting}
                    onCheckedChange={(checked) => {
                      setFilterUsed(true);
                      write(typed, checked);
                    }}
                  />
                )}
              </div>
            )}
            {lines.map((line) => (
              <Typography
                key={line}
                as="p"
                variant="body-sm"
                className="px-2 text-content-secondary"
              >
                {line}
              </Typography>
            ))}
            <div role="status" data-search-status className="sr-only">
              {announcement}
            </div>
          </div>
          <DocsSearchResults
            search={shown?.search ?? (dimmed ? previous?.search : undefined)}
            skeleton={waiting && stage !== 'quiet' && !dimmed}
            dimmed={dimmed}
            failed={failed}
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
