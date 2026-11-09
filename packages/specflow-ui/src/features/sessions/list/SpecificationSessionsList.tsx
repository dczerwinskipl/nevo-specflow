import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, InformationList, SegmentedControl, Typography } from '@nevo/ui';
import type { SessionListItem } from '@nevo/specflow-contracts/sessions';
import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import { useAnnouncer } from '../../../shared/a11y/useAnnouncer';
import { OperationalRow } from '../../../shared/operational-list';
import { useNow } from '../../../shared/operations/panel/relativeTime';
import { SessionProviderIcon } from '../shared/SessionProviderIcon';
import { sessionRowFacts, sessionRowStatus, type SessionRowAgent } from '../shared/sessionRow';
import type { SessionCollection } from './loadSessions';
import type { SpecificationSessionListState } from './useSpecificationSessionList';

/**
 * The heading the list belongs to: the nearest page title (`ViewPageTitle`, focusable with
 * `tabIndex={-1}`) found walking up from the list. The list renders no heading of its own.
 */
function owningHeading(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const heading = node.querySelector<HTMLElement>('[data-page-title]');
    if (heading) {
      return heading;
    }
  }

  return null;
}

/** A list row's agent: its ids and the Runtime's display titles. */
function agentOf(item: SessionListItem): SessionRowAgent {
  return {
    providerId: item.providerId,
    ...(item.providerTitle ? { providerTitle: item.providerTitle } : {}),
    ...(item.modelId ? { modelId: item.modelId } : {}),
    ...(item.modelTitle ? { modelTitle: item.modelTitle } : {}),
  };
}

/**
 * The Specification Sessions list (`/specs/:specId/sessions`, specification-sessions.md): the
 * current/archive collections of the Session list read, newest first, paged by an explicit
 * **Show more**. `onNewSession` is present only when the workspace's `startSession` offers it.
 */
export function SpecificationSessionsList({
  state,
  collection,
  onCollectionChange,
  onNewSession,
  onOpenSession,
}: {
  state: SpecificationSessionListState;
  collection: SessionCollection;
  onCollectionChange: (collection: SessionCollection) => void;
  onNewSession?: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const { announce: setAnnouncement, region } = useAnnouncer();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // The guarded handler of "Show more": one load at a time, whatever the button's state shows.
  const loading = useRef(false);
  const newSession = onNewSession ? (
    <Button leadingIcon="chat-plus" onClick={onNewSession}>
      {t('sessions.list.newSession')}
    </Button>
  ) : null;

  // Where focus goes once a press has ended the list: taken when the rendered list shows it (the
  // rows arrived and **Show more** is gone), whichever comes first, the commit or the press's end.
  const pendingFocus = useRef<{ kind: 'row'; index: number } | { kind: 'heading' } | null>(null);
  const consumePendingFocus = () => {
    const target = pendingFocus.current;
    if (!target || root.current?.querySelector('[data-show-more]')) {
      return;
    }

    const element =
      target.kind === 'heading'
        ? owningHeading(root.current)
        : list.current?.querySelectorAll<HTMLElement>('[data-session-row] button')[target.index];
    if (element) {
      pendingFocus.current = null;
      element.focus();
    }
  };

  const rowCount = state.status === 'ready' ? state.rows.length : 0;
  const hasMore = state.status === 'ready' && state.hasMore;
  // After each commit that adds rows or ends the cursor, take a pending focus target.
  useLayoutEffect(consumePendingFocus, [rowCount, hasMore]);

  // Cleared first, so the same text said twice (two empty batches in a row) is announced again.
  const announce = (message: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(message));
  };

  const showMore = async () => {
    if (state.status !== 'ready' || loading.current) {
      return;
    }

    loading.current = true;
    const firstAppended = state.rows.length;
    try {
      const outcome = await state.loadMore();
      if (outcome.failed) {
        announce(t('sessions.list.loadMoreFailed'));
      } else if (outcome.arrived > 0) {
        announce(t('sessions.list.loaded', { count: outcome.arrived }));
        // The button goes away with the cursor: focus moves to the first row that arrived.
        if (outcome.ended) {
          pendingFocus.current = { kind: 'row', index: firstAppended };
          consumePendingFocus();
        }
      } else if (!outcome.ended) {
        announce(t('sessions.list.noneInScanned'));
      } else {
        // The press ended the list without a row: the focused button goes away with the cursor,
        // so focus moves to the list's heading instead of falling back to the document.
        pendingFocus.current = { kind: 'heading' };
        consumePendingFocus();
      }
    } finally {
      loading.current = false;
    }
  };

  if (state.status === 'disabled') {
    // Sessions are turned off in the project: said once, without collections (not a failure).
    return (
      <div className="grid max-w-content-standard gap-6 py-2">
        <Typography variant="body-sm" className="text-content-secondary">
          {t('sessionStart.sessionsDisabled')}
        </Typography>
      </div>
    );
  }

  return (
    <div ref={root} className="grid max-w-content-standard gap-6 py-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label={t('sessions.list.collection')}
          value={collection}
          onValueChange={(value) => onCollectionChange(value as SessionCollection)}
        >
          <SegmentedControl.Item value="current">
            {t('sessions.list.current')}
          </SegmentedControl.Item>
          <SegmentedControl.Item value="archive">
            {t('sessions.list.archive')}
          </SegmentedControl.Item>
        </SegmentedControl>
        {newSession}
      </div>

      {state.status === 'loading' ? (
        <LoadingPresentation shape="list" label={t('sessions.list.loadingMore')} fetching />
      ) : state.status === 'forbidden' ? (
        <Alert role="status" tone="attention" title={t('sessions.list.forbiddenSpecification')} />
      ) : state.status === 'failed' ? (
        <Alert role="alert" tone="attention" title={t('sessions.list.failed')}>
          <Button variant="secondary" size="sm" onClick={state.retry}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : state.rows.length === 0 && !state.hasMore ? (
        <div className="grid justify-items-start gap-3">
          <Typography variant="body-md" className="text-content-secondary">
            {t(
              collection === 'archive'
                ? 'sessions.list.emptyArchive'
                : 'sessions.list.emptySpecification',
            )}
          </Typography>
          {collection === 'current' ? newSession : null}
        </div>
      ) : (
        <div ref={list} className="grid gap-6">
          {state.rows.length > 0 ? (
            <InformationList>
              {state.rows.map((item) => (
                <OperationalRow
                  key={item.sessionId}
                  leading={<SessionProviderIcon providerId={item.providerId} />}
                  primary={item.title ?? t('sessions.untitled')}
                  onPrimaryClick={() => onOpenSession(item.sessionId)}
                  factsLayout="inline"
                  compactFacts={sessionRowFacts(
                    {
                      updatedAt: item.updatedAt,
                      agent: agentOf(item),
                      taskCount:
                        item.association.kind === 'specification'
                          ? item.association.taskIds.length
                          : 0,
                    },
                    t,
                    now,
                    i18n.language,
                  )}
                  supporting={sessionRowStatus(item.readiness, agentOf(item), t)}
                  dataAttributes={{ 'data-session-row': item.sessionId }}
                />
              ))}
            </InformationList>
          ) : null}
          {state.hasMore ? (
            <div className="grid justify-items-start gap-2" data-show-more>
              <Button
                variant="secondary"
                aria-disabled={state.loadingMore || undefined}
                onClick={() => void showMore()}
              >
                {state.loadingMore ? t('sessions.list.loadingMore') : t('sessions.list.loadMore')}
              </Button>
              {state.loadMoreFailed ? (
                <Typography variant="body-sm" className="text-status-attention">
                  {t('sessions.list.loadMoreFailed')}
                </Typography>
              ) : state.noneInScanned && !state.loadingMore ? (
                <Typography variant="body-sm" className="text-content-muted">
                  {t('sessions.list.noneInScanned')}
                </Typography>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {region}
    </div>
  );
}
