import type { ReactNode } from 'react';
import { InformationList, InlineNote, Skeleton, Typography, cn } from '@nevo/ui';
import { contextRowGridClassName } from './ContextNavigationRow';

/**
 * The frame every fact-backed Context section shares: its label, then one slot that holds exactly
 * one of skeleton rows, the rows themselves or a note, so a section changing state replaces the
 * slot's content instead of moving its neighbours (fixed section order, no jump). While loading the
 * section is `aria-busy`; the label stays so the reader knows what is coming.
 */
export function ContextSection({
  title,
  busy = false,
  children,
}: {
  title: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-1" aria-busy={busy ? 'true' : undefined}>
      <Typography variant="section-label">{title}</Typography>
      {children}
    </section>
  );
}

/**
 * Loading placeholder at the height of the rows it stands for (`ContextNavigationRow`): each entry of
 * `rows` is the shape of the row it replaces: `navigation` (one line), `identity` (title + secondary
 * line) or `identity-key` (title + a monospace key line, one pixel taller than a plain secondary
 * line). Matching the heights is what keeps everything below from moving when the data arrives. The
 * DS `Skeleton` is decorative (`aria-hidden`); the section's `aria-busy` carries the state.
 */
export type ContextSkeletonShape = 'navigation' | 'identity' | 'identity-key';

export function ContextSkeletonRows({ rows }: { rows: readonly ContextSkeletonShape[] }) {
  return (
    <InformationList>
      {rows.map((shape, index) => (
        <li key={index} className="min-w-0" data-context-skeleton-row="">
          <div className={contextRowGridClassName}>
            <Skeleton className="size-[var(--spacing-icon-md)] justify-self-center" />
            <span className="grid min-w-0 gap-0.5">
              <Skeleton className="my-0.5 h-4 w-2/3" />
              {shape !== 'navigation' && (
                <Skeleton
                  className={cn('my-0.5 w-1/3', shape === 'identity-key' ? 'h-[13px]' : 'h-3')}
                />
              )}
            </span>
            <span aria-hidden="true" />
          </div>
        </li>
      ))}
    </InformationList>
  );
}

/** A Context note: `warning` (attention) for data that exists but could not be read, `error`
 * (danger) for a required reference that cannot be found. Passive: no live region, the text
 * carries the meaning. */
export function ContextNote({
  kind,
  children,
}: {
  kind: 'info' | 'warning' | 'error';
  children: ReactNode;
}) {
  return (
    <InlineNote tone={kind === 'error' ? 'danger' : kind === 'warning' ? 'attention' : 'info'}>
      {children}
    </InlineNote>
  );
}
