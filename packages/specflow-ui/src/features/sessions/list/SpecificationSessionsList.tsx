import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Alert, Button, InformationList, SegmentedControl, Typography } from '@nevo/ui';
import type { SessionListItem } from '@nevo/specflow-contracts/sessions';
import { LoadingPresentation } from '../../../app/loading/LoadingPresentation';
import { useAnnouncer } from '../../../shared/a11y/useAnnouncer';
import { OperationalRow, type CompactFacts } from '../../../shared/operational-list';
import type { SemanticSupporting } from '../../../shared/operational-list/OperationalRow.types';
import { formatRelativeTime, useNow } from '../../../shared/operations/panel/relativeTime';
import type { SessionCollection } from './loadSessions';
import type { SpecificationSessionListState } from './useSpecificationSessionList';

/**
 * A Session row's status (session-association-ux §6): Session readiness only, never an Engine
 * attempt fact. A ready Session shows none.
 */
export function sessionRowStatus(
  readiness: SessionListItem['readiness'],
  t: TFunction,
): SemanticSupporting | undefined {
  switch (readiness) {
    case 'ready':
      return undefined;
    case 'requiresAttention':
      return {
        text: t('sessions.list.statusAttention'),
        tone: 'attention',
        icon: 'triangle-alert',
      };
    case 'busy':
      return {
        text: t('sessions.list.statusActive'),
        tone: 'info',
        icon: 'loader',
        iconClassName: 'animate-spin',
      };
    default:
      return { text: t('sessions.list.statusUnknown'), textClassName: 'text-content-muted' };
  }
}

function rowFacts(item: SessionListItem, t: TFunction, now: number, locale: string): CompactFacts {
  const count = item.association.kind === 'specification' ? item.association.taskIds.length : 0;

  return [
    count > 0
      ? {
          text: t('sessions.list.taskCount', { count }),
          accessibleText: t('sessions.list.associatedTasks', { count }),
        }
      : '',
    formatRelativeTime(item.updatedAt, now, locale) ?? '',
  ];
}

/**
 * The Specification Sessions list (`/specs/:specId/sessions`, session-association-ux §3): the
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
  const list = useRef<HTMLDivElement>(null);
  // The guarded handler of "Show more": one load at a time, whatever the button's state shows.
  const loading = useRef(false);
  const newSession = onNewSession ? (
    <Button leadingIcon="chat-plus" onClick={onNewSession}>
      {t('sessions.list.newSession')}
    </Button>
  ) : null;

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
          requestAnimationFrame(() =>
            list.current
              ?.querySelectorAll<HTMLElement>('[data-session-row] button')
              [firstAppended]?.focus(),
          );
        }
      } else if (!outcome.ended) {
        announce(t('sessions.list.noneInScanned'));
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
    <div className="grid max-w-content-standard gap-6 py-2">
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
                  primary={item.title ?? t('sessions.untitled')}
                  onPrimaryClick={() => onOpenSession(item.sessionId)}
                  compactFacts={rowFacts(item, t, now, i18n.language)}
                  supporting={sessionRowStatus(item.readiness, t)}
                  dataAttributes={{ 'data-session-row': item.sessionId }}
                />
              ))}
            </InformationList>
          ) : null}
          {state.hasMore ? (
            <div className="grid justify-items-start gap-2">
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
