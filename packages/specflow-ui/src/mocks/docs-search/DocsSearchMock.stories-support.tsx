import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  Badge,
  Button,
  CheckboxField,
  EmptyState,
  Icon,
  IconButton,
  MarkdownDocument,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  SideNavigation,
  StatusIndicator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
  WorkspaceHeader,
  cn,
  type NavigationAdapter,
} from '@nevo/ui';
import { BookOpen, ChevronsUpDown, FileText } from 'lucide-react';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import type { AppLocale } from '../../i18n/i18n';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { useMessage } from '../../i18n/message';
import { ContextSwitcherTrigger } from '../../shared/context-switcher';
import { TreeSearchField } from '../../shared/document-tree';
import { WorkspacePicker } from '../../features/docs/workspace-picker';
import { displayPath } from '../../features/docs/workspace-picker/workspacePickerModel';
import { workspaceUnavailableMessage } from '../../features/workspaces/read-model';
import { DocsProposalsFilter } from '../../features/docs/tree-pane/DocsProposalsFilter';
import { DocsSearchResults } from '../../features/docs/tree-pane/DocsSearchResults';
import { TreeSkeleton } from '../../features/docs/tree-pane/TreeSkeleton';
import { searchStatus } from '../../features/docs/tree-pane/DocsSearchPanel';
import type { MockAnswer, MockHit } from './searchAnswers.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for the "Search results refinement" proposal in
 * docs/product/specflow/ui/documentation-reader.md). Static data from live answers, no routing,
 * no backend. `before` renders the shipped components (WorkspacePicker, DocsSearchResults,
 * DocsProposalsFilter, TreeSearchField); `after` hand-composes the proposal from the same nevo-ui
 * parts and the shared context switcher.
 *
 * Approximations (labelled; the contract owns the real behaviour):
 * - `CompactSwitcherTrigger` stands in for the proposed shared `ContextSwitcherTrigger` change;
 * - excerpts and match ranges are precomputed from the shipped snippets (see the fixture header);
 * - the on-screen keyboard is a grey block that shortens the frame;
 * - `scrolled` sets the pane's scroll position after the first layout.
 */

/* Proposed copy (PL is the reviewed locale; EN is in the contract). Mock-local on purpose: the
 * i18n catalogues are not changed by a mock; the implementation uses plural keys. */
const copy = {
  pl: {
    dirty: 'Zmiany lokalne',
    dirtyExplained:
      'Zmiany lokalne: czytanie i wyszukiwanie uwzględniają niezatwierdzone zmiany, także nowe pliki',
    count: (n: number) =>
      n === 1
        ? '1 wynik'
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? `${n} wyniki`
          : `${n} wyników`,
    proposals: (n: number | undefined) =>
      n === undefined ? 'Uwzględnij propozycje' : `Uwzględnij propozycje (${n})`,
    proposalsHint:
      'Propozycje to pomysły i plany z folderów oznaczonych jako propozycje, a nie obowiązujące zasady. Liczba mówi, ile propozycji jest wśród najlepszych wyników.',
    proposal: 'Propozycja',
    meaningOnly: 'Nie znaleziono dopasowań słów. Poniżej wyniki wyszukiwania znaczeniowego.',
    slow: 'Przygotowuję wyszukiwanie znaczeniowe…',
    noMatches: 'Brak pasujących dokumentów.',
  },
  en: {
    dirty: 'Local changes',
    dirtyExplained: 'Local changes: reading and search include uncommitted changes, new files too',
  },
};

export type MockVariant = 'before' | 'after';
export type MockEmpty = 'none' | 'no-match' | 'only-proposals';
export type MockReason = 'index-building' | 'endpoint-unreachable' | 'index-unavailable';

export interface DocsSearchMockProps {
  variant: MockVariant;
  width: number;
  height: number;
  workspaces: WorkspaceList;
  selectedWorkspaceId: string;
  answer: MockAnswer;
  /** The shown result rows (the search is static): `none` shows the answer. */
  empty?: MockEmpty;
  /** The opened document (aria-current row). */
  activeId?: string;
  /** The pane is scrolled by this many pixels (the sticky search). */
  scrolled?: number;
  /** The on-screen keyboard is open: the visible viewport is this many pixels shorter. */
  keyboard?: number;
  pickerOpen?: boolean;
  /** A word-only answer and its reason (the shipped UI shows only index-building). */
  reason?: MockReason;
  /** The field text when it differs from the answer's query (a no-match search). */
  query?: string;
  /** The answer has been pending for over 2 s: the first search (no rows yet) or a changed query. */
  loading?: 'first' | 'refine';
}

/* ------------------------------------------------------------------ the proposed trigger */

export interface TriggerSegment {
  readonly text: string;
}

/** A state of the current choice the reader must always see (its own slot, not a description). */
export interface TriggerStatus {
  readonly text: string;
  /** `attention`: informational amber (local changes); `danger`: it cannot be read now. */
  readonly tone: 'attention' | 'danger';
}

/**
 * The end kept whole when an identifier-like name (no spaces: a workspace, a branch) is truncated
 * in the middle: its last segment after a separator (- _ / .), with the one before it when the last
 * is shorter than 6 characters, at most 16 characters; the last 8 characters without a separator.
 * Prose names (with spaces, such as a Specification title) truncate at the end: undefined.
 */
export function distinguishingTail(name: string): string | undefined {
  if (/\s/.test(name) || name.length <= 16) {
    return undefined;
  }

  const cuts = [...name.matchAll(/[-_/.]/g)].map((match) => match.index);
  const last = cuts.at(-1);
  if (last === undefined) {
    return name.slice(-8);
  }

  const start = name.length - last < 6 && cuts.length > 1 ? cuts.at(-2)! : last;

  return name.length - start <= 16 ? name.slice(start) : name.slice(-16);
}

/**
 * Proposed shared `ContextSwitcherTrigger` (approximation): the quiet label; the name on ONE line
 * (ellipsis; the full name in a tooltip on hover and keyboard focus ONLY when it is truncated, and
 * in full in the popover)
 * with an optional trailing STATUS that never truncates; ONE detail line of kind-specific segments
 * joined by " · ". The Specification switcher passes its key as the detail and no status.
 */
export function CompactSwitcherTrigger({
  label,
  name,
  segments,
  status,
  ...button
}: {
  label: string;
  name: string;
  segments: readonly TriggerSegment[];
  status?: TriggerStatus;
} & Omit<React.ComponentPropsWithRef<'button'>, 'children' | 'name' | 'className'>) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const tail = distinguishingTail(name);
  useLayoutEffect(() => {
    const el = nameRef.current;
    setTruncated(el !== null && el.scrollWidth > el.clientWidth);
  }, [name]);

  return (
    // No tooltip for a name shown whole.
    <Tooltip open={truncated ? undefined : false}>
      <TooltipTrigger asChild>
        <button
          type="button"
          {...button}
          data-mock-trigger
          className="relative block min-h-11 w-full rounded-control px-3 py-2 text-left outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <Typography as="span" variant="body-sm" className="mb-1 block pr-5 text-content-muted">
            {label}
          </Typography>
          <span className="flex min-w-0 items-baseline gap-2">
            <Typography
              as="span"
              variant="title-sm"
              className="flex min-w-0 flex-1 text-content-primary"
            >
              {tail === undefined ? (
                <span ref={nameRef} className="min-w-0 truncate">
                  {name}
                </span>
              ) : (
                <>
                  <span ref={nameRef} className="min-w-0 truncate">
                    {name.slice(0, name.length - tail.length)}
                  </span>
                  <span className="shrink-0 whitespace-pre">{tail}</span>
                </>
              )}
            </Typography>
            {status && (
              <span
                className="flex shrink-0 items-center gap-1.5 self-center text-body-sm text-content-secondary"
                data-mock-status
              >
                <StatusIndicator tone={status.tone} />
                {status.text}
              </span>
            )}
          </span>
          {segments.length > 0 && (
            <Typography
              as="span"
              variant="body-sm"
              className="block truncate text-content-secondary"
            >
              {segments.map((segment, index) => (
                <span key={segment.text}>
                  {index > 0 && <span className="text-content-muted"> · </span>}
                  {segment.text}
                </span>
              ))}
            </Typography>
          )}
          <Icon name={ChevronsUpDown} size="sm" className="absolute right-3 top-2" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-72 wrap-anywhere">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}

function useWorkspaceFacts(locale: AppLocale = 'pl') {
  const { t } = useTranslation();
  const text = useMessage();

  return (workspace: WorkspaceListItem) => {
    const kind =
      workspace.kind === 'primary'
        ? t('workspacePicker.projectFolder')
        : t('workspacePicker.worktree');
    const segments: TriggerSegment[] = [
      { text: kind },
      ...workspace.specifications.map((spec) => ({ text: spec.title })),
    ];
    const status: TriggerStatus | undefined =
      !workspace.available && workspace.unavailableReason
        ? { text: text(workspaceUnavailableMessage(workspace.unavailableReason)), tone: 'danger' }
        : workspace.dirty
          ? { text: copy[locale].dirty, tone: 'attention' }
          : undefined;

    return { segments, status };
  };
}

/**
 * Proposed ContextSwitcherOption with the same status slot as the trigger (approximation of a
 * shared change): the name wrapping in full, the detail line, the short status (the local-changes
 * explanation is said once, under the list), and Selected with a check. Unavailable keeps the danger dot here too,
 * so amber means only local changes.
 */
function MockOption({
  name,
  title,
  selected,
  unavailable,
  status,
  detail,
}: {
  name: string;
  title: string;
  selected: boolean;
  unavailable: boolean;
  status?: TriggerStatus;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={unavailable || undefined}
      title={title}
      className={cn(
        'flex min-h-11 items-start gap-2 rounded-control px-2 py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus-ring aria-selected:bg-surface-selected',
        unavailable ? 'cursor-not-allowed' : 'hover:bg-surface-hover',
      )}
    >
      <span className="min-w-0 flex-1">
        <Typography
          as="span"
          variant="title-sm"
          className={cn(
            'block whitespace-normal [overflow-wrap:anywhere]',
            unavailable ? 'text-content-muted' : 'text-content-primary',
          )}
        >
          {name}
        </Typography>
        <Typography as="span" variant="body-sm" className="block text-content-secondary">
          {detail}
        </Typography>
        {status && (
          <span className="flex items-start gap-1.5 text-body-sm text-content-secondary">
            <StatusIndicator tone={status.tone} className="mt-1.5 shrink-0" />
            {status.text}
          </span>
        )}
        {selected && (
          <Typography as="span" variant="body-sm" className="block text-content-secondary">
            Wybrano
          </Typography>
        )}
      </span>
      {selected ? <Icon name="check" size="sm" /> : null}
    </button>
  );
}

/** The proposed workspace picker: the compact trigger; the popover keeps every detail. */
export function ProposedWorkspacePicker({
  workspaces,
  selectedWorkspaceId,
  open = false,
}: {
  workspaces: WorkspaceList;
  selectedWorkspaceId: string;
  open?: boolean;
}) {
  const { t } = useTranslation();
  const factsOf = useWorkspaceFacts();
  const list = workspaces.workspaces;
  const current = list.find((w) => w.workspaceId === selectedWorkspaceId) ?? list[0]!;
  const projectFolderPath = list.find((w) => w.workspaceId === workspaces.projectFolderId)?.path;
  const facts = factsOf(current);

  return (
    <div className="min-w-0 rounded-control bg-surface-subtle" data-mock-picker>
      <Popover open={open}>
        <PopoverTrigger asChild>
          <CompactSwitcherTrigger
            aria-description={t('workspacePicker.change')}
            label={t('workspacePicker.label')}
            name={current.name}
            segments={facts.segments}
            status={facts.status}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          motion="navigation"
          aria-label={t('workspacePicker.change')}
          className="w-80 p-3"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div role="listbox" aria-label={t('workspacePicker.list')} className="grid gap-1">
            {list.map((workspace) => {
              const { segments, status } = factsOf(workspace);

              return (
                <MockOption
                  key={workspace.workspaceId}
                  name={workspace.name}
                  title={displayPath(workspace.path, projectFolderPath)}
                  selected={workspace.workspaceId === current.workspaceId}
                  unavailable={!workspace.available}
                  status={status}
                  detail={segments.map((segment) => segment.text).join(' · ')}
                />
              );
            })}
          </div>
          {/* The local-changes explanation, said once for the whole list (touch has no tooltip). */}
          {list.some((workspace) => workspace.available && workspace.dirty) && (
            <Typography
              as="p"
              variant="body-sm"
              className="mt-2 border-t border-divider px-2 pt-2 text-content-muted"
            >
              {copy.pl.dirtyExplained}
            </Typography>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ the proposed results */

/** The section path without a leading heading that only repeats the document title. */
export function sectionPath(hit: Pick<MockHit, 'title' | 'headingPath'>): readonly string[] {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const [first, ...rest] = hit.headingPath;

  return first !== undefined && norm(first) === norm(hit.title) ? rest : hit.headingPath;
}

function Highlighted({ text, matches }: Pick<MockHit, 'text' | 'matches'>) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of matches) {
    if (start > at) {
      parts.push(text.slice(at, start));
    }

    parts.push(
      <mark key={start} className="bg-transparent font-medium text-content-primary">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }

  parts.push(text.slice(at));

  return <>{parts}</>;
}

/**
 * At most `parent › leaf`. One line of clamped height that wraps: the leaf comes first in the
 * reversed row, so a parent that does not fit whole wraps onto the hidden second line instead of
 * shrinking; only the leaf ellipsizes. The full path is the title.
 */
function SectionPath({ path }: { path: readonly string[] }) {
  const leaf = path.at(-1)!;
  const parent = path.at(-2);

  return (
    <span
      title={path.join(' › ')}
      className="flex h-4 min-w-0 flex-row-reverse flex-wrap justify-end overflow-hidden text-body-sm text-content-muted"
      data-mock-section-path
    >
      <span className="min-w-0 max-w-full truncate">{leaf}</span>
      {parent !== undefined && (
        <span className="shrink-0 whitespace-nowrap">
          {parent}
          <span aria-hidden className="mx-1">
            ›
          </span>
        </span>
      )}
    </span>
  );
}

export function ProposedResults({
  results,
  activeId,
}: {
  results: readonly MockHit[];
  activeId?: string;
}) {
  return (
    <section aria-label="Wyniki wyszukiwania">
      <ul className="m-0 grid list-none p-0">
        {results.map((hit) => {
          const path = sectionPath(hit);

          return (
            <li key={hit.id} className="border-b border-divider last:border-b-0">
              <button
                type="button"
                data-mock-result
                aria-current={hit.id === activeId ? 'true' : undefined}
                className={cn(
                  'my-0.5 grid w-full min-w-0 gap-0.5 rounded-control px-2 py-1.5 text-left outline-none',
                  'hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring',
                  'aria-[current=true]:bg-surface-selected',
                )}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <span className="line-clamp-2 min-w-0 flex-1 text-title-sm text-content-primary">
                    {hit.title}
                  </span>
                  {hit.proposal && (
                    <Badge size="compact" className="mt-0.5 shrink-0">
                      {copy.pl.proposal}
                    </Badge>
                  )}
                </span>
                {path.length > 0 && <SectionPath path={path} />}
                {hit.text && (
                  <span className="line-clamp-2 text-body-sm text-content-muted">
                    <Highlighted text={hit.text} matches={hit.matches} />
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

/**
 * The status row: the visible count and the proposals checkbox. The quiet lines (the word-only
 * reason, the "no word match" line) follow it. One visually hidden live region announces the count
 * and those lines together, once per settled answer.
 */
function ProposedStatusRow({
  count,
  lines,
  proposals,
  includeProposals,
}: {
  count: string | undefined;
  lines: readonly string[];
  /** `undefined` while the answer loads: the label has no number and keeps its place. */
  proposals: number | undefined;
  includeProposals: boolean;
}) {
  const shown = includeProposals || proposals === undefined || proposals > 0;

  return (
    <>
      <span role="status" className="sr-only">
        {[count ?? (proposals === undefined ? '' : copy.pl.noMatches), ...lines].join(' ').trim()}
      </span>
      {/* The row is at least one target tall, so the 44 px touch targets never reach the field. */}
      {(count !== undefined || shown) && (
        <div className="flex min-h-(--target-size) min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2">
          {count && (
            <Typography as="p" variant="body-sm" aria-hidden className="text-content-muted">
              {count}
            </Typography>
          )}
          {shown && (
            // gap-3: the info button's 44 px hit area does not overlap the label's.
            <div className="flex min-w-0 items-center gap-3">
              <CheckboxField checked={includeProposals} label={copy.pl.proposals(proposals)} />
              <Popover>
                <PopoverTrigger asChild>
                  <IconButton
                    icon="info"
                    size="xs"
                    variant="ghost"
                    aria-label="Czym są propozycje?"
                  />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3">
                  <Typography as="p" variant="body-sm" className="text-content-secondary">
                    {copy.pl.proposalsHint}
                  </Typography>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** The quiet line of a word-only answer, by reason; configuration reasons stay silent. */
function reasonLine(reason: MockReason | undefined): string | undefined {
  switch (reason) {
    case 'index-building':
      return 'Na razie tylko dopasowania słów: indeks wyszukiwania jest budowany (62%).';
    case 'endpoint-unreachable':
      return 'Tylko dopasowania słów: wyszukiwanie znaczeniowe jest niedostępne.';
    case 'index-unavailable':
      return 'Tylko dopasowania słów: indeks wyszukiwania jest niedostępny.';
    default:
      return undefined;
  }
}

function ProposedPane(props: DocsSearchMockProps) {
  const { t } = useTranslation();
  const { answer, empty = 'none', reason, loading } = props;
  const results = empty === 'none' ? answer.results : [];
  const proposals = loading
    ? undefined
    : empty === 'only-proposals'
      ? 2
      : empty === 'no-match'
        ? 0
        : answer.includeProposals
          ? answer.results.filter((hit) => hit.proposal).length
          : answer.proposalsLeftOut;
  const mode = reason ? 'lexical' : answer.mode;
  // The count of the list, never a total: the search has no total (the limit caps the list).
  const count = results.length === 0 || loading ? undefined : copy.pl.count(results.length);
  // A server fact (`wordMatch`), only in hybrid mode: in word-only mode every result matched words.
  const meaningOnly =
    !loading && mode === 'hybrid' && results.length > 0 && results.every((hit) => !hit.wordMatch);
  const lines = loading
    ? [copy.pl.slow]
    : [reasonLine(reason), meaningOnly ? copy.pl.meaningOnly : undefined].filter(
        (line): line is string => line !== undefined,
      );

  return (
    <PaneScroller scrolled={props.scrolled}>
      <ProposedWorkspacePicker
        workspaces={props.workspaces}
        selectedWorkspaceId={props.selectedWorkspaceId}
        open={props.pickerOpen}
      />
      {/* Only the field sticks (the minimum sticky set); a plain divider under it. */}
      <div
        role="search"
        className="sticky top-0 z-10 -mx-2 -my-2 border-b border-divider bg-surface-raised px-3 py-2"
        data-mock-sticky
      >
        <TreeSearchField
          label={t('docs.search.label')}
          value={props.query ?? answer.query}
          onChange={() => undefined}
          onClear={() => undefined}
        />
      </div>
      {/* The status row is one touch target tall; its own slack replaces the gap below it. */}
      <div className="-mb-2 grid gap-1">
        <ProposedStatusRow
          count={count}
          lines={lines}
          proposals={proposals}
          includeProposals={answer.includeProposals && empty === 'none'}
        />
        {lines.map((line) => (
          <Typography
            key={line}
            as="p"
            variant="body-sm"
            aria-hidden
            className="px-2 text-content-secondary"
            data-mock-quiet-line
          >
            {line}
          </Typography>
        ))}
      </div>
      {loading === 'first' ? (
        // The first search of the field: skeleton rows (shown only after 400 ms).
        <TreeSkeleton />
      ) : loading === 'refine' ? (
        // A changed query: the previous rows stay in place, dimmed and inert, until the answer.
        <div aria-busy="true" inert className="opacity-50" data-mock-stale>
          <ProposedResults results={results} activeId={props.activeId} />
        </div>
      ) : results.length > 0 ? (
        <ProposedResults results={results} activeId={props.activeId} />
      ) : (
        <div className="px-2">
          <EmptyState
            variant="inline"
            title={t('docs.search.noMatches')}
            description={
              empty === 'only-proposals'
                ? t('docs.search.onlyProposals', { count: 2 })
                : t('docs.search.noMatchesHint')
            }
            actions={
              <Button variant="secondary" size="sm">
                {t('common.clearSearch')}
              </Button>
            }
          />
        </div>
      )}
    </PaneScroller>
  );
}

/* ------------------------------------------------------------------ the shipped pane */

function toSearch(answer: MockAnswer, results: readonly MockHit[]): WorkspaceDocsSearch {
  return {
    mode: 'hybrid',
    workspaceId: '3e1203d1-8939-4039-9dc6-6c8c0016576c',
    corpusRevision: 'mock',
    proposalsLeftOut: answer.proposalsLeftOut,
    skipped: [],
    results: results.map((hit, index) => ({
      id: hit.id,
      title: hit.title,
      type: 'reference',
      status: 'current',
      file: hit.file,
      score: 1 - index / 100,
      wordMatch: true,
      sections: [
        {
          headingPath: [...hit.headingPath],
          sectionId: 'mock',
          line: 1,
          score: 1,
          snippet: hit.snippet,
        },
      ],
    })),
  };
}

function BeforePane(props: DocsSearchMockProps) {
  const { t } = useTranslation();
  const { answer, empty = 'none' } = props;
  const results = empty === 'none' ? answer.results : [];
  const search = toSearch(
    empty === 'only-proposals' ? { ...answer, proposalsLeftOut: 2 } : answer,
    results,
  );
  const proposals = new Set(answer.results.filter((hit) => hit.proposal).map((hit) => hit.id));
  const status = searchStatus(t, { search, pending: false, failed: false });
  const proposalCount = answer.includeProposals
    ? results.filter((hit) => hit.proposal).length
    : search.proposalsLeftOut;

  return (
    <PaneScroller scrolled={props.scrolled}>
      <WorkspacePicker
        workspaces={props.workspaces}
        selectedWorkspaceId={props.selectedWorkspaceId}
        onSelect={() => undefined}
      />
      <div role="search" className="px-1">
        <TreeSearchField
          label={t('docs.search.label')}
          value={answer.query}
          onChange={() => undefined}
          onClear={() => undefined}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2">
        <div role="status" className="grid min-w-0 gap-0.5">
          {status.shown.map((line) => (
            <Typography key={line} as="p" variant="body-sm" className="text-content-muted">
              {line}
            </Typography>
          ))}
        </div>
        {(answer.includeProposals || proposalCount > 0) && (
          <DocsProposalsFilter
            checked={answer.includeProposals && empty !== 'only-proposals'}
            count={proposalCount}
            pending={false}
            onCheckedChange={() => undefined}
          />
        )}
      </div>
      <DocsSearchResults
        search={search}
        pending={false}
        failed={false}
        proposals={proposals}
        activeDocumentId={props.activeId}
        onClear={() => undefined}
        onRetry={() => undefined}
        onOpen={() => undefined}
      />
    </PaneScroller>
  );
}

/** The tree pane's one scroller (as `DocsTreePane`), optionally scrolled for the sticky state. */
function PaneScroller({ scrolled, children }: { scrolled?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // After the first layout (the ScrollArea measures itself), like a user who scrolled.
    const timer = setTimeout(() => {
      if (ref.current && scrolled) {
        ref.current.scrollTop = scrolled;
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [scrolled]);

  return (
    <AppContent className="h-full w-full">
      <div className="flex min-h-0 flex-1 flex-col" data-mock-pane>
        <ScrollArea
          direction="vertical"
          className="min-h-0 flex-1"
          contentClassName="grid content-start gap-3 p-2"
          viewportRef={ref}
          tabIndex={-1}
        >
          {children}
        </ScrollArea>
      </div>
    </AppContent>
  );
}

/* ------------------------------------------------------------------ the frame */

const article = `Provider session identity is opaque. Application code MUST NOT derive semantics from its string format. A provider-backed session MUST be addressed by the composite \`ProviderSessionRef = (provider, providerSessionId)\`.

## Canonical in, provider-specific out

Application code asks the adapter to:

- create or attach a session;
- start or cancel a Turn;
- answer a canonical interaction;
- inspect provider-backed session metadata.

The adapter translates those operations into the provider's real protocol and maps provider output back into canonical events/state.`;

interface NavTarget {
  href: string;
}

function DocsNavigation() {
  const adapter: NavigationAdapter<NavTarget> = {
    match: (node) => (node.key === 'docs' ? 'active' : 'none'),
    renderLink: ({ children, className, isActive, node }) => (
      <a
        aria-current={isActive ? 'page' : undefined}
        className={className}
        href={node.target?.href}
      >
        {children}
      </a>
    ),
  };

  return (
    <div className="px-3 py-4">
      <SideNavigation
        adapter={adapter}
        label="Nawigacja"
        nodes={[
          { key: 'specs', label: 'Specyfikacje', target: { href: '#specs' } },
          { key: 'docs', label: 'Dokumentacja', target: { href: '#docs' } },
        ]}
        rootIcons={{ specs: FileText, docs: BookOpen }}
      />
    </div>
  );
}

function Workspace(props: DocsSearchMockProps) {
  const pane = props.variant === 'before' ? <BeforePane {...props} /> : <ProposedPane {...props} />;
  const wide = props.width >= 900;
  const opened = props.answer.results.find((hit) => hit.id === props.activeId);

  return (
    <AppWorkspaceProvider scopeKey="docs-search-mock">
      <AppWorkspace
        scroll="content"
        fit="available"
        primaryMaxPx={360}
        split="secondary"
        stackedSecondaryClose="hide"
        labels={{ backToPrimary: 'Wróć do dokumentacji', closeSecondary: 'Zamknij' }}
      >
        <AppWorkspace.Primary header={<WorkspaceHeader title="Dokumentacja" />}>
          {pane}
        </AppWorkspace.Primary>
        {wide && (
          <AppWorkspace.Secondary
            open
            header={<WorkspaceHeader headingLevel={2} title={opened?.title ?? 'Dokumentacja'} />}
          >
            <AppContent className="h-full w-full">
              <ScrollArea className="min-h-0 flex-1" contentClassName="max-w-content-narrow p-4">
                <Typography as="h1" variant="title-lg" className="mb-3">
                  {opened?.title ?? 'AI provider boundary'}
                </Typography>
                <MarkdownDocument source={article} />
              </ScrollArea>
            </AppContent>
          </AppWorkspace.Secondary>
        )}
      </AppWorkspace>
    </AppWorkspaceProvider>
  );
}

export function DocsSearchMock(props: DocsSearchMockProps): ReactNode {
  const { width, height, keyboard = 0 } = props;

  return (
    <StoryLocalization locale="pl">
      <TooltipProvider delayDuration={300}>
        <div style={{ width, height }} className="flex flex-col" data-mock-frame={width}>
          <div style={{ height: height - keyboard }} className="min-h-0 shrink-0">
            <AppShell
              navigation={<DocsNavigation />}
              style={{ height: '100%' }}
              labels={{ navigationTitle: 'Nawigacja' }}
            >
              <Workspace key={JSON.stringify(props)} {...props} />
            </AppShell>
          </div>
          {keyboard > 0 && (
            <div
              className="flex flex-1 items-center justify-center bg-surface-control text-body-sm text-content-muted"
              data-mock-keyboard
            >
              Klawiatura ekranowa (symulacja)
            </div>
          )}
        </div>
      </TooltipProvider>
    </StoryLocalization>
  );
}

/* ------------------------------------------------------------------ trigger board */

export interface TriggerCase {
  readonly title: string;
  readonly label: string;
  readonly name: string;
  readonly before: readonly { text: string; tone?: 'secondary' | 'muted' | 'attention' }[];
  readonly after: readonly TriggerSegment[];
  readonly status?: TriggerStatus;
}

/**
 * The shipped and the proposed trigger for each case, one row per case, at the tree pane's and
 * the drawer's width (320 px).
 */
export function TriggerBoard({
  cases,
  locale = 'pl',
}: {
  cases: readonly TriggerCase[];
  locale?: AppLocale;
}) {
  return (
    <StoryLocalization locale={locale}>
      <TooltipProvider>
        <div className="grid gap-4 bg-canvas p-4" style={{ width: 720 }} data-mock-board>
          <div className="grid grid-cols-[320px_320px] gap-6">
            <Typography as="h2" variant="title-sm">
              Shipped
            </Typography>
            <Typography as="h2" variant="title-sm">
              Proposed
            </Typography>
          </div>
          {cases.map((item) => (
            <div key={item.title} className="grid gap-1">
              <Typography as="p" variant="body-sm" className="text-content-muted">
                {item.title}
              </Typography>
              <div className="grid grid-cols-[320px_320px] items-start gap-6">
                <div className="rounded-control bg-surface-subtle" data-mock-case="before">
                  <ContextSwitcherTrigger
                    label={item.label}
                    name={item.name}
                    details={item.before}
                  />
                </div>
                <div className="min-w-0 rounded-control bg-surface-subtle" data-mock-case="after">
                  <CompactSwitcherTrigger
                    label={item.label}
                    name={item.name}
                    segments={item.after}
                    status={item.status}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>
    </StoryLocalization>
  );
}
