import { Icon, type IconName } from '@nevo/ui';
import type { ReactNode } from 'react';

export interface SessionMetaPresentation {
  readonly icon?: IconName;
  readonly iconClassName?: string;
  readonly textClassName?: string;
}

export function parseSessionMeta(meta: string): {
  readonly status: string;
  readonly context?: string;
  readonly time?: string;
  readonly presentation: SessionMetaPresentation;
} {
  const parts = meta.split('·').map((p) => p.trim());
  const status = parts[0] ?? '';
  const context = parts[1];
  const time = parts[2];
  const statusLower = status.toLowerCase();

  let presentation: SessionMetaPresentation = {
    textClassName: 'text-content-muted',
  };

  if (statusLower.includes('agent pracuje') || statusLower.includes('working')) {
    presentation = {
      icon: 'loader',
      iconClassName: 'text-accent-primary animate-spin',
      textClassName: 'text-accent-primary font-medium',
    };
  } else if (
    statusLower.includes('czeka') ||
    statusLower.includes('waiting') ||
    statusLower.includes('uwagi') ||
    statusLower.includes('decyzji')
  ) {
    presentation = {
      icon: 'triangle-alert',
      iconClassName: 'text-status-attention',
      textClassName: 'text-status-attention font-medium',
    };
  } else if (statusLower.includes('zakończona') || statusLower.includes('completed')) {
    presentation = {
      icon: 'circle-check',
      iconClassName: 'text-status-success',
      textClassName: 'text-content-muted',
    };
  }

  return { status, context, time, presentation };
}

export function SessionMetaLine({ meta }: { readonly meta: string }): ReactNode {
  const { status, context, time, presentation } = parseSessionMeta(meta);

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-body-sm text-content-muted">
      <span className="inline-flex items-center gap-1.5 truncate">
        {presentation.icon && (
          <span className="flex size-4 shrink-0 items-center justify-center">
            <Icon name={presentation.icon} size="sm" className={presentation.iconClassName} />
          </span>
        )}
        <span className={presentation.textClassName}>{status}</span>
      </span>
      {context && (
        <span className="inline-flex items-baseline gap-x-2">
          <span aria-hidden="true" className="text-content-muted">
            ·
          </span>
          <span className="text-content-secondary">{context}</span>
        </span>
      )}
      {time && (
        <span className="inline-flex items-baseline gap-x-2">
          <span aria-hidden="true" className="text-content-muted">
            ·
          </span>
          <span className="text-content-muted">{time}</span>
        </span>
      )}
    </div>
  );
}
