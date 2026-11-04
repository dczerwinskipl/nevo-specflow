import type { ReactNode } from 'react';
import { Icon, Typography, cn, fastColorTransitionClassName, type IconName } from '@nevo/ui';

/**
 * One row of Session Context (navigation into a subject, a Task/Specification reference, or an
 * Attention item). Every row in Context shares this single geometry so icons, labels and chevrons
 * sit on the same three tracks:
 *
 * ```text
 * [ icon-md ] 12px [ label  count .................. ] 12px [ chevron ]
 *             12px [ secondary line (optional) ...... ]
 * ```
 *
 * - The row has no inline padding of its own: the leading icon starts at the content edge owned by
 *   the host (`AppWorkspaceBody`), the same edge as the section headings, and the chevron ends at
 *   the right content edge. Hover and focus surfaces bleed outward into the host padding through a
 *   `::before` (`-inset-x-2`) instead of pushing the visible content inward.
 * - Icon, text and chevron are vertically centred on the whole row (`items-center`), so a two-line
 *   row keeps its chevron centred instead of aligned with the first line.
 * - Single-line rows are 40 px (`py-2.5` + the 20 px `body-md` line); multi-line rows grow from
 *   their content. On coarse pointers the hit area is expanded on the block axis to the touch
 *   target (`--target-size`) without growing the visual row (component-guidelines "Target size").
 * - Label weight follows its information role (`emphasis`): a Specification/Task title is the
 *   object's identity (`title-sm`, semibold); a navigation subject is regular `body-md` (not bold
 *   just because it is clickable). An identity title is one truncated line, the height of the
 *   loading skeleton that stands for it (`ContextSkeletonRows`), so a long title, or one set in a
 *   wider fallback font, never grows the row when the data arrives. The optional `count` sits
 *   right after the label in `content-muted`, and the optional `secondary` line is `body-sm`
 *   `content-muted`.
 */
export interface ContextNavigationRowProps {
  /** Registry icon shown in the leading track. */
  icon?: IconName;
  /** Custom leading node (e.g. a `StatusIndicator`) centred in the same track, instead of `icon`. */
  leading?: ReactNode;
  label: ReactNode;
  /**
   * `identity` when the label is the named object itself (a Specification or Task title): the DS
   * "primary information" role, `title-sm` (semibold). `navigation` (default) for subject/entry
   * rows such as "Files / Changes" or a count summary: regular `body-md`. The weight follows the
   * information role, never the mere fact that the row is clickable.
   */
  emphasis?: 'navigation' | 'identity';
  count?: ReactNode;
  secondary?: ReactNode;
  /** When omitted the row is static (no chevron, no hover); the geometry stays identical. */
  onClick?: () => void;
  ariaLabel?: string;
}

export const contextRowGridClassName =
  'grid w-full min-w-0 grid-cols-[var(--spacing-icon-md)_minmax(0,1fr)_var(--spacing-icon-sm)] items-center gap-x-3 py-2.5 text-left';

export function ContextNavigationRow({
  icon,
  leading,
  label,
  emphasis = 'navigation',
  count,
  secondary,
  onClick,
  ariaLabel,
}: ContextNavigationRowProps) {
  const body = (
    <>
      <span className="relative flex items-center justify-center text-content-muted">
        {icon ? <Icon name={icon} size="md" /> : leading}
      </span>
      <span className="relative grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-x-1.5">
          {emphasis === 'identity' ? (
            // One line, like the skeleton that stands for it: a title that wrapped would grow the
            // row on arrival and move every section below it. The full title stays the button's
            // accessible name and its hover title, and the opened object shows it whole.
            <Typography
              variant="title-sm"
              className="min-w-0 truncate text-content-primary"
              title={typeof label === 'string' ? label : undefined}
            >
              {label}
            </Typography>
          ) : (
            <Typography
              variant="body-md"
              className="min-w-0 text-content-primary [overflow-wrap:anywhere]"
            >
              {label}
            </Typography>
          )}
          {count !== undefined && (
            <Typography variant="body-md" className="shrink-0 tabular-nums text-content-muted">
              {count}
            </Typography>
          )}
        </span>
        {secondary && (
          <Typography
            as="span"
            variant="body-sm"
            className="block min-w-0 text-content-muted [overflow-wrap:anywhere]"
          >
            {secondary}
          </Typography>
        )}
      </span>
      {onClick ? (
        <Icon
          name="chevron-right"
          size="sm"
          className="relative text-content-muted"
          aria-hidden="true"
        />
      ) : (
        <span aria-hidden="true" />
      )}
    </>
  );

  return (
    <li className="min-w-0">
      {onClick ? (
        <button
          type="button"
          data-focus-ring="delegated"
          aria-label={ariaLabel}
          onClick={onClick}
          className={cn(
            contextRowGridClassName,
            'group relative cursor-pointer outline-none',
            // Hover/focus surface bleeds into the host's inline padding; content stays on the grid.
            "before:absolute before:-inset-x-2 before:inset-y-0.5 before:rounded-control before:content-['']",
            'before:transition-colors before:[transition-duration:var(--motion-duration-fast)] motion-reduce:before:transition-none',
            'hover:before:bg-surface-hover focus-visible:before:outline-2 focus-visible:before:outline-focus-ring',
            // Touch target: expand the block axis only, never the visual row.
            "after:absolute after:inset-x-0 after:top-1/2 after:h-[max(100%,var(--target-size))] after:-translate-y-1/2 after:content-['']",
            fastColorTransitionClassName,
          )}
        >
          {body}
        </button>
      ) : (
        <div className={contextRowGridClassName}>{body}</div>
      )}
    </li>
  );
}
