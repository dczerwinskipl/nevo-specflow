import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, Typography, cn } from '@nevo/ui';

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
  ariaLabel: string,
  className: string,
) => ReactNode;

const contentClassName = 'flex min-w-0 flex-1 items-center gap-3';
const linkClassName = cn(
  contentClassName,
  'min-h-11 rounded-composite px-3 py-2 text-content-primary no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring',
);
const plainClassName = cn(contentClassName, 'min-h-11 px-3 py-2');

export interface OperationRowProps {
  readonly item: OperationListItem;
  readonly kind: OperationKindPresentation | undefined;
  readonly now: number;
  readonly renderLink?: RenderOperationLink;
  /** Present for rows that may be hidden (finished ones). */
  readonly onDismiss?: (operationId: string) => void;
}

/**
 * One operation as a compact row: status mark, title, kind and branch, the step it is on, and how
 * long ago. The whole row is one link to the operation's page when its kind has one. Text comes
 * from the row data and the kind adapter only.
 */
export function OperationRow({ item, kind, now, renderLink, onDismiss }: OperationRowProps) {
  const { t, i18n } = useTranslation();
  const text = (value: Parameters<typeof translateMessage>[1]) =>
    translateMessage(t, value, i18n.resolvedLanguage);
  const view = presentOperation(item, kind, now);
  const title = text(view.name);
  const kindLabel = text(kind?.label ?? message('operations.kind.unknown'));
  const branch = item.target?.branch;
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
  const ariaLabel = [title, kindLabel, status, detail, action].filter(Boolean).join(', ');

  const content = (
    <>
      <OperationStatusTile tone={view.tone} size="sm" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <Typography as="span" variant="body-md" className="min-w-0 break-words">
          {title}
        </Typography>
        <Typography as="span" variant="body-sm" className="min-w-0 break-words text-content-muted">
          {[kindLabel, branch].filter(Boolean).join(' · ')}
        </Typography>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <Typography
            as="span"
            variant="body-sm"
            className="min-w-0 break-words text-content-secondary"
          >
            {detail ?? status}
          </Typography>
          {action ? (
            <Typography as="span" variant="body-sm" className="font-medium text-content-primary">
              {action}
            </Typography>
          ) : null}
          {timeText ? (
            <Typography as="span" variant="body-sm" className="text-content-muted">
              <time dateTime={timeIso}>{timeText}</time>
            </Typography>
          ) : null}
        </span>
      </span>
      {href ? (
        <Icon name="chevron-right" size="sm" className="shrink-0 text-content-muted" />
      ) : null}
    </>
  );

  return (
    <li
      data-operation-id={item.operationId}
      data-operation-kind={item.kind}
      data-operation-status={item.status}
      className="flex min-w-0 items-center gap-1"
    >
      {href ? (
        renderLink ? (
          renderLink(href, content, ariaLabel, linkClassName)
        ) : (
          <a href={href} aria-label={ariaLabel} className={linkClassName}>
            {content}
          </a>
        )
      ) : (
        <div className={plainClassName}>{content}</div>
      )}
      {onDismiss && isDismissible(item) ? (
        <IconButton
          icon="close"
          size="sm"
          aria-label={text(message('operations.row.dismiss', { name: title }))}
          onClick={() => onDismiss(item.operationId)}
        />
      ) : null}
    </li>
  );
}
