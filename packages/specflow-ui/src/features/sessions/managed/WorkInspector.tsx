import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ToolActionSummary, WorkSummary } from '@nevo/specflow-contracts/sessions';
import {
  Alert,
  AppContent,
  Button,
  Collapsible,
  EmptyState,
  Icon,
  IconButton,
  InputGroup,
  ScrollArea,
  SegmentedControl,
  Spinner,
  StatusIndicator,
  TextInput,
  Timeline,
  Typography,
  defineSecondaryStack,
  useSecondaryStack,
} from '@nevo/ui';
import { translateNow } from '../../../i18n/message';
import type { ManagedSessionsApi } from './api';
import type { SessionFeed } from './feed';
import { ReadableText } from './MessageText';
import {
  buildWorkChapters,
  filterWorkChapters,
  groupChapterEntries,
  mergeToolActions,
  mergeWorkItems,
  workFilterKinds,
  type ChapterEntry,
  type ToolBurstEntry,
  type WorkChapter,
  type WorkFilterKind,
} from './workGrouping';

interface Root {
  sessionId: string;
  turnId: string;
}
type Data = Root & { api: ManagedSessionsApi; feed: SessionFeed; owner: string };
interface Pages {
  work: Record<string, never>;
  actions: { workId: string };
}
function useWorkRefresh(feed: SessionFeed, turnId: string, refresh: () => Promise<unknown>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = feed.subscribeWork((changed) => {
      if (changed !== turnId || timer) {
        return;
      }

      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 300);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [feed, turnId, refresh]);
}

type SemanticTone = 'neutral' | 'info' | 'success' | 'attention' | 'danger';

/** Shared Work/ToolAction state vocabulary -> semantic tone (sessions.md `WorkStateSchema`). */
function stateTone(state: WorkSummary['state']): SemanticTone {
  switch (state) {
    case 'active':
      return 'info';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'cancelled':
    case 'interrupted':
      return 'attention';
    case 'queued':
    case 'waiting':
    case 'expired':
    default:
      return 'neutral';
  }
}

interface WorkFilterState {
  kind: WorkFilterKind;
  search: string;
}

function WorkFilterBar({
  filter,
  onChange,
}: {
  filter: WorkFilterState;
  onChange: (next: WorkFilterState) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid min-w-0 gap-2">
      <SegmentedControl
        aria-label={t('managedSession.workInspector.filterLabel')}
        value={filter.kind}
        onValueChange={(value) => onChange({ ...filter, kind: value as WorkFilterKind })}
      >
        {workFilterKinds.map((kind) => (
          <SegmentedControl.Item key={kind} value={kind}>
            {kind === 'all'
              ? t('managedSession.workInspector.filterAll')
              : t(`managedSession.workKind.${kind}`)}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
      <InputGroup className="min-w-0">
        <InputGroup.Addon>
          <Icon name="search" size="sm" />
        </InputGroup.Addon>
        <TextInput
          type="search"
          className="[&::-webkit-search-cancel-button]:appearance-none"
          aria-label={t('managedSession.workInspector.search')}
          placeholder={t('managedSession.workInspector.search')}
          value={filter.search}
          onChange={(event) => onChange({ ...filter, search: event.target.value })}
        />
        {filter.search && (
          <InputGroup.Action>
            <IconButton
              aria-label={t('managedSession.workInspector.clearSearch')}
              icon="close"
              size="xs"
              onClick={() => onChange({ ...filter, search: '' })}
            />
          </InputGroup.Action>
        )}
      </InputGroup>
    </div>
  );
}

/** A reasoning summary: separately labeled "Thinking" and optionally collapsible — never styled
 * like a tool action or presented as Commentary (session-chat-v10-design.md §4). */
function ReasoningEntryRow({ item, data }: { item: WorkSummary; data: Data }) {
  const { t } = useTranslation();

  return (
    <Collapsible>
      <Collapsible.Trigger>
        <span className="italic text-content-muted">
          {t('managedSession.workInspector.thinking')}
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ReadableText api={data.api} sessionId={data.sessionId} value={item.title} />
      </Collapsible.Content>
    </Collapsible>
  );
}

function InteractionEntryRow({ item }: { item: WorkSummary }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 items-center gap-2 text-body-sm">
      <StatusIndicator
        tone={stateTone(item.state)}
        decorative={false}
        aria-label={t(`managedSession.workState.${item.state}`)}
      />
      <span className="text-content-secondary">{t('managedSession.workKind.interaction')}</span>
      <span className="text-content-muted">· {t(`managedSession.workState.${item.state}`)}</span>
    </div>
  );
}

/** A compact tool row. Clicking a Work item with child ToolActions opens that exact Work's
 * ToolActionSummary detail (ToolAction stays the tool's own child, never a top-level row). */
function ToolEntryRow({
  item,
  onOpenActions,
}: {
  item: WorkSummary;
  onOpenActions: (workId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 items-start gap-2 text-body-sm">
      <StatusIndicator
        tone={stateTone(item.state)}
        decorative={false}
        aria-label={t(`managedSession.workState.${item.state}`)}
        className="mt-1"
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="min-w-0 truncate text-content-secondary">{item.title.text}</span>
        {!!item.actionCount && (
          <Button
            size="sm"
            variant="ghost"
            className="h-auto w-fit justify-start px-0"
            onClick={() => onOpenActions(item.workId)}
          >
            {t('managedSession.actions')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Two or more consecutive happy-path tool items, compacted into one collapsible row
 * (session-work-inspector-ui-spec.md §6.2/§6.3). Collapsed by default: the point is to not
 * clutter L2 with a long run of uneventful successful tool calls. */
function ToolBurstRow({
  burst,
  onOpenActions,
}: {
  burst: ToolBurstEntry;
  onOpenActions: (workId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Collapsible>
      <Collapsible.Trigger>
        {t('managedSession.workInspector.toolBurst', { count: burst.items.length })}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ul className="grid gap-1.5">
          {burst.items.map((item) => (
            <li key={item.workId}>
              <ToolEntryRow item={item} onOpenActions={onOpenActions} />
            </li>
          ))}
        </ul>
      </Collapsible.Content>
    </Collapsible>
  );
}

function WorkChapterEntryRow({
  entry,
  data,
  onOpenActions,
}: {
  entry: ChapterEntry;
  data: Data;
  onOpenActions: (workId: string) => void;
}) {
  if (entry.type === 'burst') {
    return <ToolBurstRow burst={entry} onOpenActions={onOpenActions} />;
  }

  const { item } = entry;
  if (item.kind === 'reasoning') {
    return <ReasoningEntryRow item={item} data={data} />;
  }

  if (item.kind === 'interaction') {
    return <InteractionEntryRow item={item} />;
  }

  return <ToolEntryRow item={item} onOpenActions={onOpenActions} />;
}

/** One Commentary-headed phase: the Commentary itself is a readable Markdown heading — never the
 * collapse trigger, so a link inside it stays a normal link — and its operations are a
 * subordinate, independently collapsible list (session-chat-v10-design.md §4). The leading
 * "Start of Turn" chapter uses a neutral label instead of a Commentary heading. */
function WorkChapterSection({
  chapter,
  data,
  onOpenActions,
}: {
  chapter: WorkChapter;
  data: Data;
  onOpenActions: (workId: string) => void;
}) {
  const { t } = useTranslation();
  const entries = useMemo(() => groupChapterEntries(chapter.items), [chapter.items]);

  return (
    <section className="grid min-w-0 gap-2 border-b border-border-subtle pb-4 last:border-b-0 last:pb-0">
      {chapter.commentary ? (
        <ReadableText
          api={data.api}
          sessionId={data.sessionId}
          value={chapter.commentary.title}
          markdown
        />
      ) : (
        <Typography as="h3" variant="label-sm" className="text-content-secondary">
          {t('managedSession.workInspector.startOfTurn')}
        </Typography>
      )}
      {entries.length > 0 && (
        <Collapsible defaultExpanded>
          <Collapsible.Trigger>
            {t('managedSession.workInspector.operationsCount', { count: entries.length })}
          </Collapsible.Trigger>
          <Collapsible.Content>
            <ul className="grid gap-1.5">
              {entries.map((entry) => (
                <li key={entry.type === 'burst' ? entry.items[0]!.workId : entry.item.workId}>
                  <WorkChapterEntryRow entry={entry} data={data} onOpenActions={onOpenActions} />
                </li>
              ))}
            </ul>
          </Collapsible.Content>
        </Collapsible>
      )}
    </section>
  );
}

function Work({ data }: { data: Data }) {
  const { t } = useTranslation();
  const navigation = useSecondaryStack<Pages>();
  const [items, setItems] = useState<WorkSummary[]>([]);
  const [history, setHistory] = useState<{ hasOlder: boolean; before?: string }>({
    hasOlder: false,
  });
  const [olderBusy, setOlderBusy] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [filter, setFilter] = useState<WorkFilterState>({ kind: 'all', search: '' });
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | undefined>(undefined);

  // Always fetches the current tail window (no `before`): older pages are loaded progressively
  // and merged locally (see `loadOlder`), never fetched eagerly — this stays a bounded
  // `WorkPage` request even for a Turn with hundreds of historical Work items.
  const query = useQuery({
    queryKey: ['managed-work', data.owner, data.sessionId, data.turnId],
    queryFn: ({ signal }) => data.api.work(data.sessionId, data.turnId, undefined, signal),
  });
  useWorkRefresh(data.feed, data.turnId, query.refetch);

  useEffect(() => {
    if (!query.data) {
      return;
    }

    setItems((previous) => mergeWorkItems(previous, query.data.items));
    setHistory(query.data.history);
  }, [query.data]);

  // Restores the viewport anchor after an older page is prepended (session-work-inspector-ui-
  // spec.md §5.5): the user's current scroll position must not jump when older content loads
  // above it. Mirrors ManagedSession's own history-scroll-anchor technique.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !anchor.current) {
      return;
    }

    node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
    anchor.current = undefined;
  }, [items]);

  async function loadOlder() {
    if (!history.before || olderBusy) {
      return;
    }

    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    setOlderBusy(true);
    setOlderError(false);
    try {
      const page = await data.api.work(data.sessionId, data.turnId, history.before);
      setItems((previous) => mergeWorkItems(previous, page.items));
      setHistory(page.history);
    } catch {
      anchor.current = undefined;
      setOlderError(true);
    } finally {
      setOlderBusy(false);
    }
  }

  const chapters = useMemo(() => buildWorkChapters(items), [items]);
  const visibleChapters = useMemo(() => filterWorkChapters(chapters, filter), [chapters, filter]);
  const openActions = (workId: string) => void navigation.navTo('actions', { workId });

  return (
    <AppContent className="h-full w-full">
      <ScrollArea viewportRef={scroller} className="min-h-0 w-full flex-1" contentClassName="p-4">
        <div className="grid gap-4">
          {query.isPending && <p role="status">{t('managedSession.loading')}</p>}
          {query.isError && (
            <Alert tone="attention" title={t('managedSession.failed')}>
              <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
            </Alert>
          )}
          {!query.isPending && !query.isError && (
            <>
              <WorkFilterBar filter={filter} onChange={setFilter} />
              {history.hasOlder && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={olderBusy}
                    onClick={() => void loadOlder()}
                  >
                    {t('managedSession.workInspector.loadOlder')}
                  </Button>
                  {olderBusy && <Spinner size="sm" label={t('common.loading')} />}
                </div>
              )}
              {olderError && (
                <Alert tone="attention" title={t('managedSession.failed')}>
                  <Button size="sm" onClick={() => void loadOlder()}>
                    {t('common.retry')}
                  </Button>
                </Alert>
              )}
              {items.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.emptyTurn')} />
              ) : visibleChapters.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.noMatches')} />
              ) : (
                visibleChapters.map((chapter) => (
                  <WorkChapterSection
                    key={chapter.id}
                    chapter={chapter}
                    data={data}
                    onOpenActions={openActions}
                  />
                ))
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </AppContent>
  );
}

function Actions({ data, params }: { data: Data; params: { workId: string } }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToolActionSummary[]>([]);
  const [history, setHistory] = useState<{ hasOlder: boolean; before?: string }>({
    hasOlder: false,
  });
  const [olderBusy, setOlderBusy] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | undefined>(undefined);

  const query = useQuery({
    queryKey: ['managed-actions', data.owner, data.sessionId, params.workId],
    queryFn: ({ signal }) => data.api.actions(data.sessionId, params.workId, undefined, signal),
  });
  useWorkRefresh(data.feed, data.turnId, query.refetch);

  useEffect(() => {
    if (!query.data) {
      return;
    }

    setItems((previous) => mergeToolActions(previous, query.data.items));
    setHistory(query.data.history);
  }, [query.data]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !anchor.current) {
      return;
    }

    node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
    anchor.current = undefined;
  }, [items]);

  async function loadOlder() {
    if (!history.before || olderBusy) {
      return;
    }

    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    setOlderBusy(true);
    setOlderError(false);
    try {
      const page = await data.api.actions(data.sessionId, params.workId, history.before);
      setItems((previous) => mergeToolActions(previous, page.items));
      setHistory(page.history);
    } catch {
      anchor.current = undefined;
      setOlderError(true);
    } finally {
      setOlderBusy(false);
    }
  }

  return (
    <AppContent className="h-full w-full">
      <ScrollArea viewportRef={scroller} className="min-h-0 w-full flex-1" contentClassName="p-4">
        <div className="grid gap-4">
          {query.isPending && <p role="status">{t('managedSession.loading')}</p>}
          {query.isError && (
            <Alert tone="attention" title={t('managedSession.failed')}>
              <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
            </Alert>
          )}
          {!query.isPending && !query.isError && (
            <>
              {history.hasOlder && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={olderBusy}
                    onClick={() => void loadOlder()}
                  >
                    {t('managedSession.workInspector.loadOlder')}
                  </Button>
                  {olderBusy && <Spinner size="sm" label={t('common.loading')} />}
                </div>
              )}
              {olderError && (
                <Alert tone="attention" title={t('managedSession.failed')}>
                  <Button size="sm" onClick={() => void loadOlder()}>
                    {t('common.retry')}
                  </Button>
                </Alert>
              )}
              {items.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.noActions')} />
              ) : (
                // L3/L4 exact chronology: the generic Timeline is the right default here, unlike
                // the Commentary-grouped L2 Work log above (session-work-inspector-ui-spec.md §2).
                <Timeline size="sm" aria-label={t('managedSession.actions')}>
                  {items.map((item) => (
                    <Timeline.Item key={item.actionId}>
                      <Timeline.Marker tone={stateTone(item.state)} />
                      <Timeline.Content title={t(`managedSession.workState.${item.state}`)}>
                        <div className="grid min-w-0 gap-2">
                          <ReadableText
                            api={data.api}
                            sessionId={data.sessionId}
                            value={item.title}
                          />
                          {item.input && (
                            <div className="grid min-w-0 gap-1">
                              <Typography variant="label-sm" className="text-content-muted">
                                {t('managedSession.workInspector.input')}
                              </Typography>
                              <ReadableText
                                api={data.api}
                                sessionId={data.sessionId}
                                value={{ text: '', complete: false, content: item.input }}
                              />
                            </div>
                          )}
                          {item.output && (
                            <div className="grid min-w-0 gap-1">
                              <Typography variant="label-sm" className="text-content-muted">
                                {t('managedSession.workInspector.output')}
                              </Typography>
                              <ReadableText
                                api={data.api}
                                sessionId={data.sessionId}
                                value={{ text: '', complete: false, content: item.output }}
                              />
                            </div>
                          )}
                          {item.error && <Alert tone="attention" title={item.error.message} />}
                        </div>
                      </Timeline.Content>
                    </Timeline.Item>
                  ))}
                </Timeline>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </AppContent>
  );
}

export function createWorkInspector(api: ManagedSessionsApi, feed: SessionFeed, owner: string) {
  return defineSecondaryStack<Root, Data, Pages>({
    id: 'managed-session-work',
    initial: 'work',
    useData: (params) => ({ status: 'ready', data: { ...params, api, feed, owner } }),
    screens: {
      work: {
        get title() {
          return translateNow('managedSession.work');
        },
        component: Work,
      },
      actions: {
        get title() {
          return translateNow('managedSession.actions');
        },
        component: Actions,
      },
    },
  });
}
