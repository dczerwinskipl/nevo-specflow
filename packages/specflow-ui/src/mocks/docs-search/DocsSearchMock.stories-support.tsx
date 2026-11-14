import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { useMessage } from '../../i18n/message';
import { ContextSwitcherOption, ContextSwitcherTrigger } from '../../shared/context-switcher';
import { TreeSearchField } from '../../shared/document-tree';
import { WorkspacePicker } from '../../features/docs/workspace-picker';
import { displayPath } from '../../features/docs/workspace-picker/workspacePickerModel';
import { workspaceUnavailableMessage } from '../../features/workspaces/read-model';
import { DocsProposalsFilter } from '../../features/docs/tree-pane/DocsProposalsFilter';
import { DocsSearchResults } from '../../features/docs/tree-pane/DocsSearchResults';
import { searchStatus } from '../../features/docs/tree-pane/DocsSearchPanel';
import type { MockAnswer, MockHit } from './searchAnswers.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for the "Search results refinement" proposal in
 * docs/product/specflow/ui/documentation-reader.md). Static data from live answers, no routing,
 * no backend. `before` renders the shipped components (WorkspacePicker, DocsSearchResults,
 * DocsProposalsFilter, TreeSearchField); `after` hand-composes the proposal from the same nevo-ui
 * parts and the shared context switcher. Every story pins one frame width.
 */

/** The search's default limit (`limit` of the workspace search route). */
const SEARCH_LIMIT = 10;

/* Proposed copy (PL is the reviewed locale; EN is in the contract). Mock-local on purpose: the
 * i18n catalogues are not changed by a mock. */
const copy = {
  dirty: 'Zmiany lokalne',
  countTop: (n: number) => `${n} najlepszych dokumentów`,
  countSome: (n: number) =>
    n === 1
      ? '1 pasujący dokument'
      : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
        ? `${n} pasujące dokumenty`
        : `${n} pasujących dokumentów`,
  proposals: (n: number | undefined) => (n === undefined ? 'Propozycje' : `Propozycje (${n})`),
  proposalsName: (n: number) => `Uwzględnij propozycje, pasujących: ${n}`,
  proposalsHint:
    'Zaznacz, aby uwzględnić propozycje: pomysły i plany z folderów oznaczonych jako propozycje, a nie obowiązujące zasady. Liczba mówi, ile propozycji pasuje do wyszukiwania.',
  proposal: 'Propozycja',
};

export type MockVariant = 'before' | 'after';
export type MockEmpty = 'none' | 'no-match' | 'only-proposals';

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
}

/* ------------------------------------------------------------------ the proposed trigger */

export interface TriggerSegment {
  readonly text: string;
  readonly tone?: 'secondary' | 'attention';
}

/**
 * Proposed shared `ContextSwitcherTrigger`: the quiet label, the name on ONE line (ellipsis; the
 * full name in a tooltip on hover and keyboard focus, and in full in the popover), and ONE detail
 * line whose segments are joined by " · " and which ends in an ellipsis. Same paddings, glyph and
 * focus ring as today, so the Specification switcher with a key and the workspace picker are both
 * 72 px, and the Specification switcher without a key stays 56 px.
 */
export function CompactSwitcherTrigger({
  label,
  name,
  segments,
  ...button
}: {
  label: string;
  name: string;
  segments: readonly TriggerSegment[];
} & Omit<React.ComponentPropsWithRef<'button'>, 'children' | 'name' | 'className'>) {
  return (
    <Tooltip>
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
          <Typography as="span" variant="title-sm" className="block truncate text-content-primary">
            {name}
          </Typography>
          {segments.length > 0 && (
            <Typography as="span" variant="body-sm" className="block truncate">
              {segments.map((segment, index) => (
                <span
                  key={segment.text}
                  className={
                    segment.tone === 'attention'
                      ? 'text-status-attention'
                      : 'text-content-secondary'
                  }
                >
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

function useWorkspaceSegments() {
  const { t } = useTranslation();
  const text = useMessage();

  return (workspace: WorkspaceListItem): TriggerSegment[] => {
    const kind =
      workspace.kind === 'primary'
        ? t('workspacePicker.projectFolder')
        : t('workspacePicker.worktree');
    if (!workspace.available && workspace.unavailableReason) {
      return [
        { text: kind },
        { text: text(workspaceUnavailableMessage(workspace.unavailableReason)), tone: 'attention' },
      ];
    }

    return [
      { text: kind },
      ...(workspace.dirty ? [{ text: copy.dirty }] : []),
      ...workspace.specifications.map((spec) => ({ text: spec.title })),
    ];
  };
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
  const segmentsOf = useWorkspaceSegments();
  const list = workspaces.workspaces;
  const current = list.find((w) => w.workspaceId === selectedWorkspaceId) ?? list[0]!;
  const projectFolderPath = list.find((w) => w.workspaceId === workspaces.projectFolderId)?.path;

  return (
    <div className="min-w-0 rounded-control bg-surface-subtle" data-mock-picker>
      <Popover open={open}>
        <PopoverTrigger asChild>
          <CompactSwitcherTrigger
            aria-description={t('workspacePicker.change')}
            label={t('workspacePicker.label')}
            name={current.name}
            segments={segmentsOf(current)}
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
              const segments = segmentsOf(workspace);
              const reasons = segments.filter((segment) => segment.tone === 'attention');

              return (
                <ContextSwitcherOption
                  key={workspace.workspaceId}
                  name={workspace.name}
                  title={displayPath(workspace.path, projectFolderPath)}
                  selected={workspace.workspaceId === current.workspaceId}
                  unavailable={!workspace.available}
                  details={[
                    {
                      text: segments
                        .filter((segment) => segment.tone !== 'attention')
                        .map((segment) => segment.text)
                        .join(' · '),
                    },
                    ...reasons.map((reason) => ({ text: reason.text, tone: 'attention' as const })),
                  ]}
                />
              );
            })}
          </div>
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

/** Ancestors truncate first; the deepest section keeps its room. */
function SectionPath({ path }: { path: readonly string[] }) {
  const leaf = path.at(-1)!;
  const ancestors = path.slice(0, -1);

  return (
    <span className="flex min-w-0 text-body-sm text-content-muted" data-mock-section-path>
      {ancestors.length > 0 && (
        <>
          <span className="min-w-8 shrink-[1000] truncate">{ancestors.join(' › ')}</span>
          <span className="mx-1 shrink-0" aria-hidden>
            ›
          </span>
        </>
      )}
      <span className="min-w-0 truncate">{leaf}</span>
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
                      {copy.proposal}
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

function ProposedStatusRow({
  count,
  proposals,
  includeProposals,
}: {
  count: string | undefined;
  proposals: number;
  includeProposals: boolean;
}) {
  const shown = includeProposals || proposals > 0;

  return (
    <div className="flex min-h-6 min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2">
      {/* The live region stays mounted; without a count it is read out, not shown. */}
      <Typography
        as="p"
        variant="body-sm"
        role="status"
        className={count ? 'text-content-muted' : 'sr-only'}
      >
        {count ?? 'Brak pasujących dokumentów'}
      </Typography>
      {shown && (
        <div className="flex min-w-0 items-center gap-1">
          <CheckboxField
            checked={includeProposals}
            label={copy.proposals(proposals)}
            aria-label={copy.proposalsName(proposals)}
          />
          <Popover>
            <PopoverTrigger asChild>
              <IconButton icon="info" size="xs" variant="ghost" aria-label="Czym są propozycje?" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {copy.proposalsHint}
              </Typography>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

function ProposedPane(props: DocsSearchMockProps) {
  const { t } = useTranslation();
  const { answer, empty = 'none' } = props;
  const results = empty === 'none' ? answer.results : [];
  const proposals =
    empty === 'only-proposals'
      ? 2
      : answer.includeProposals
        ? answer.results.filter((hit) => hit.proposal).length
        : answer.proposalsLeftOut;
  const count =
    results.length === 0
      ? undefined
      : results.length >= SEARCH_LIMIT
        ? copy.countTop(results.length)
        : copy.countSome(results.length);

  return (
    <PaneScroller scrolled={props.scrolled}>
      <ProposedWorkspacePicker
        workspaces={props.workspaces}
        selectedWorkspaceId={props.selectedWorkspaceId}
        open={props.pickerOpen}
      />
      {/* The search block sticks to the top of the pane's scroller; the picker scrolls away. */}
      <div
        className="sticky top-0 z-10 -mx-2 -mt-2 grid gap-2 px-2 pb-1 pt-2 data-[stuck=true]:bg-surface-raised data-[stuck=true]:shadow-[0_1px_0_var(--color-divider)]"
        data-stuck={props.scrolled ? 'true' : undefined}
        data-mock-sticky
      >
        <div role="search" className="px-1">
          <TreeSearchField
            label={t('docs.search.label')}
            value={answer.query}
            onChange={() => undefined}
            onClear={() => undefined}
          />
        </div>
        <ProposedStatusRow
          count={count}
          proposals={proposals}
          includeProposals={answer.includeProposals && empty !== 'only-proposals'}
        />
      </div>
      {results.length > 0 ? (
        <ProposedResults results={results} activeId={props.activeId} />
      ) : (
        <div className="px-2">
          <EmptyState
            variant="inline"
            icon="search"
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
}

/**
 * The shipped and the proposed trigger for each case, one row per case, at the tree pane's and
 * the drawer's width (320 px).
 */
export function TriggerBoard({ cases }: { cases: readonly TriggerCase[] }) {
  return (
    <StoryLocalization locale="pl">
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
                <div className="rounded-control bg-surface-subtle" data-mock-case="after">
                  <CompactSwitcherTrigger
                    label={item.label}
                    name={item.name}
                    segments={item.after}
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
