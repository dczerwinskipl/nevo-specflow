import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Typography, cn } from '@nevo/ui';

import { message, translateMessage } from '../../i18n/message';
import { OperationStatusTile } from './OperationStatusTile';
import { isDismissible, type OperationListItem } from './operationList';
import type { OperationKindPresentation } from './operationKinds';
import { presentOperation } from './operationRowModel';
import { formatRelativeTime } from './relativeTime';

/** Draws the link of a row; the host passes its router's link, a plain anchor is the default. */
export type RenderOperationLink = (
  href: string,
  children: ReactNode,
  className: string,
) => ReactNode;

const contentClassName = 'flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5';
const linkClassName = cn(
  contentClassName,
  'text-content-primary no-underline hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
);

export interface OperationRowProps {
  readonly item: OperationListItem;
  readonly kind: OperationKindPresentation | undefined;
  readonly now: number;
  readonly renderLink?: RenderOperationLink;
  /** Present for rows that may be hidden (finished ones). */
  readonly onDismiss?: (operationId: string) => void;
}

/**
 * One operation as a plain row of the panel (no surface of its own): status icon, the name of the
 * specification and ONE meta line, "step or status · time". The whole row is one link to the
 * operation's page when its kind has one, with no trailing arrow: a clickable row is clickable as
 * a whole. Text comes from the row data and the kind adapter only.
 */
export function OperationRow({ item, kind, now, renderLink, onDismiss }: OperationRowProps) {
  const { t, i18n } = useTranslation();
  const text = (value: Parameters<typeof translateMessage>[1]) =>
    translateMessage(t, value, i18n.resolvedLanguage);
  const view = presentOperation(item, kind, now);
  const title = text(view.name);
  const status = text(view.status);
  const detail = view.detail ? text(view.detail) : undefined;
  const action = view.action ? text(view.action) : undefined;
  const running = item.status === 'in-progress';
  const timeIso = running && item.startedAt ? item.startedAt : item.updatedAt;
  const relative = formatRelativeTime(timeIso, now, i18n.resolvedLanguage ?? 'en');
  const timeText = relative
    ? text(
        message(running && item.startedAt ? 'operations.row.started' : 'operations.row.updated', {
          time: relative,
        }),
      )
    : undefined;
  const href = kind?.detailHref(item);

  const content = (
    <>
      <span className="flex h-6 shrink-0 items-center">
        <OperationStatusTile tone={view.tone} size="sm" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <Typography as="span" variant="body-md" className="min-w-0 break-words font-medium">
          {title}
          <span className="sr-only">, </span>
        </Typography>
        <Typography
          as="span"
          variant="body-sm"
          className="min-w-0 break-words text-content-secondary"
          data-operation-meta
        >
          {detail ? <span className="sr-only">{status}. </span> : null}
          {detail ?? status}
          {action ? <span className="font-medium text-content-primary">{` · ${action}`}</span> : null}
          {timeText ? (
            <>
              <span aria-hidden="true"> · </span>
              <time dateTime={timeIso} className="text-content-muted">
                {timeText}
              </time>
            </>
          ) : null}
        </Typography>
      </span>
    </>
  );

  return (
    <li
      data-operation-id={item.operationId}
      data-operation-kind={item.kind}
      data-operation-status={item.status}
      className="flex min-w-0 items-start"
    >
      {href ? (
        renderLink ? (
          renderLink(href, content, linkClassName)
        ) : (
          <a href={href} className={linkClassName}>
            {content}
          </a>
        )
      ) : (
        <div className={contentClassName}>{content}</div>
      )}
      {onDismiss && isDismissible(item) ? (
        <IconButton
          icon="close"
          size="sm"
          className="mr-1 mt-1.5"
          aria-label={text(message('operations.row.dismiss', { name: title }))}
          onClick={() => onDismiss(item.operationId)}
        />
      ) : null}
    </li>
  );
}
