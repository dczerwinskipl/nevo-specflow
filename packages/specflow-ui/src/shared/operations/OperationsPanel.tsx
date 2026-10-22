import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, IconButton, Typography } from '@nevo/ui';

import { message, translateMessage, type Message } from '../../i18n/message';
import { OperationRow, type RenderOperationLink } from './OperationRow';
import {
  isDismissible,
  isRunningOperation,
  needsAttention,
  type OperationList,
  type OperationListItem,
} from './operationList';
import { findOperationKind, type OperationKindRegistry } from './operationKinds';
import {
  dismissOperation,
  setOperationsCollapsed,
  useDismissedOperations,
  useOperationsCollapsed,
} from './operationsSession';
import { useNow } from './relativeTime';

/** Rows shown before "Show all". */
export const operationsPanelVisibleRows = 5;

export interface OperationsPanelProps {
  readonly list: OperationList | undefined;
  /** The last read failed; with `list` the rows stay and a caption says it is retrying. */
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly kinds: OperationKindRegistry;
  readonly renderLink?: RenderOperationLink;
}

/** Announcement for a row that just changed status, or undefined (a quiet change). */
function transitionMessage(
  item: OperationListItem,
  name: Message | string,
  from: string,
): Message | undefined {
  if (from === item.status) return undefined;
  if (item.status === 'completed') return message('operations.announce.completed', { name });
  if (item.status === 'recovery-required')
    return message('operations.announce.attention', { name });
  if (item.status === 'failed') return message('operations.announce.failed', { name });
  return undefined;
}

/**
 * The panel of background operations of one feature: hidden when there is nothing to show, a
 * collapsible list of compact rows otherwise (5, then "Show all"). It is a list, not a live region;
 * a separate polite status announces only status transitions. Finished rows can be hidden for the
 * session; a row that needs a check cannot.
 */
export function OperationsPanel({
  list,
  failed,
  onRetry,
  kinds,
  renderLink,
}: OperationsPanelProps) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const bodyId = useId();
  const now = useNow();
  const dismissed = useDismissedOperations();
  const [collapsedByUser] = useOperationsCollapsed();
  const [showAll, setShowAll] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const text = (value: Message | string) => translateMessage(t, value, i18n.resolvedLanguage);

  const rows = (list?.items ?? []).filter(
    (item) => !(isDismissible(item) && dismissed.has(item.operationId)),
  );

  // Status transitions are announced politely; the first read and quiet changes say nothing.
  const previous = useRef<ReadonlyMap<string, string> | undefined>(undefined);
  const attentionSeen = useRef<ReadonlySet<string>>(new Set());
  const announce = useRef((value: Message | string) => text(value));
  announce.current = text;
  useEffect(() => {
    if (!list) return;
    const before = previous.current;
    previous.current = new Map(list.items.map((item) => [item.operationId, item.status]));
    const attention = new Set(list.items.filter(needsAttention).map((item) => item.operationId));
    // A row that starts needing a check opens a collapsed panel.
    if ([...attention].some((id) => !attentionSeen.current.has(id))) setOperationsCollapsed(false);
    attentionSeen.current = attention;
    if (!before) return;
    const messages = list.items.flatMap((item) => {
      const from = before.get(item.operationId);
      if (from === undefined) return [];
      const kind = findOperationKind(kinds, item.kind);
      const name = item.title ?? kind?.label ?? message('operations.kind.unknown');
      return transitionMessage(item, name, from) ?? [];
    });
    if (messages.length)
      setAnnouncement(messages.map((value) => announce.current(value)).join('. '));
  }, [list, kinds]);

  const liveRegion = (
    <div role="status" aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );

  if (!list && failed)
    return (
      <Alert
        tone="info"
        data-operations-panel="error"
        actions={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        }
      >
        {t('operations.panel.loadFailed')}
      </Alert>
    );
  if (!rows.length) return liveRegion;

  const count = (status: string, serverCount: number | undefined) =>
    Math.max(serverCount ?? 0, rows.filter((row) => row.status === status).length);
  const running = Math.max(list?.counts.inProgress ?? 0, rows.filter(isRunningOperation).length);
  const attention = count('recovery-required', list?.counts.recoveryRequired);
  const failedCount = count('failed', list?.counts.failed);
  const finished = count('completed', list?.counts.completed);
  const summary = [
    running ? t('operations.panel.running', { count: running }) : undefined,
    attention ? t('operations.panel.attention', { count: attention }) : undefined,
    failedCount ? t('operations.panel.failed', { count: failedCount }) : undefined,
    !running && !attention && !failedCount && finished
      ? t('operations.panel.finished', { count: finished })
      : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  const collapsed = collapsedByUser && attention === 0;
  const shown = showAll ? rows : rows.slice(0, operationsPanelVisibleRows);
  const total = Math.max(rows.length, running + attention + failedCount + finished);

  return (
    <section
      aria-labelledby={headingId}
      data-operations-panel
      className="min-w-0 rounded-composite border border-border-subtle"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <Typography as="h2" variant="body-md" id={headingId} className="font-medium">
            {t('operations.panel.title')}
          </Typography>
          <Typography as="span" variant="body-sm" className="text-content-secondary">
            {summary}
          </Typography>
        </div>
        <IconButton
          icon={collapsed ? 'chevron-right' : 'chevron-down'}
          size="sm"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={t(collapsed ? 'operations.panel.expand' : 'operations.panel.collapse')}
          onClick={() => setOperationsCollapsed(!collapsed)}
        />
      </header>
      <div id={bodyId} hidden={collapsed} className="grid gap-1 px-1 pb-2">
        <ul className="m-0 grid list-none gap-1 p-0">
          {shown.map((item) => (
            <OperationRow
              key={item.operationId}
              item={item}
              kind={findOperationKind(kinds, item.kind)}
              now={now}
              renderLink={renderLink}
              onDismiss={dismissOperation}
            />
          ))}
        </ul>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-2">
          {rows.length > operationsPanelVisibleRows ? (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? t('operations.panel.showFewer')
                : t('operations.panel.showAll', { total: rows.length })}
            </Button>
          ) : null}
          {showAll && list?.truncated ? (
            <Typography as="span" variant="body-sm" className="text-content-muted">
              {t('operations.panel.showing', { shown: rows.length, total })}
            </Typography>
          ) : null}
          {failed ? (
            <Typography as="span" variant="body-sm" className="text-content-muted">
              {t('operations.panel.refreshFailed')}
            </Typography>
          ) : null}
        </div>
      </div>
      {liveRegion}
    </section>
  );
}
