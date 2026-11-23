import { useState, type ComponentPropsWithRef } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
  cn,
  Icon,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
} from '@nevo/ui';
import { ContextSwitcherStatus, type ContextSwitcherStatusValue } from './ContextSwitcherStatus';
import { useTruncatedName } from './useTruncatedName';

/**
 * The trigger of a context switcher (the current Specification, the workspace being read): a quiet
 * label; the current name on one line (identifier-like names cut in the middle, prose at the end)
 * or wrapped to three lines for a Specification title, with an optional trailing status that never
 * truncates; one detail line of the kind's segments
 * joined by " · " (the first segment comes first so it is the last to truncate); the up-down glyph.
 * The full name is offered in a tooltip on hover and
 * keyboard focus only when it does not show whole; `note` adds a line to that tooltip (and keeps it
 * available). It opens on mouse hover and keyboard (focus-visible) focus, not on focus a drawer
 * moves here. It stays closed while the popover is open and after it closes, until the pointer
 * leaves or focus moves on: focus returning from the popover must not raise a tooltip that would
 * swallow the next Escape (meant for a surrounding drawer). Rendered as the `PopoverTrigger asChild`
 * child, so the popover's props and ref land on the button.
 */
export function ContextSwitcherTrigger({
  label,
  name,
  segments = [],
  status,
  note,
  loading = false,
  wrapName = false,
  ...button
}: {
  label: string;
  name: string;
  segments?: readonly string[];
  status?: ContextSwitcherStatusValue;
  /** A fact for the tooltip only (a workspace's folder). */
  note?: string;
  /** The current context has not settled yet: a neutral placeholder instead of the name. */
  loading?: boolean;
  /** Give a prose title up to three lines. The picker option displays the full title. */
  wrapName?: boolean;
} & Omit<ComponentPropsWithRef<'button'>, 'children' | 'name' | 'className' | 'title'>) {
  const fitted = useTruncatedName(name);
  const showName = !wrapName && fitted.truncated && !loading;
  const hasTooltip = showName || Boolean(note);
  const expanded = button['aria-expanded'] === true || button['aria-expanded'] === 'true';
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  if (expanded && !suppressed) {
    setSuppressed(true);
  }

  const release = () => {
    if (!expanded) {
      setSuppressed(false);
      setTooltipOpen(false);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip
        open={tooltipOpen && hasTooltip && !suppressed}
        onOpenChange={(next) =>
          // Hover by a mouse or pen, or keyboard focus: not the focus a drawer or popover moves here.
          setTooltipOpen(
            next && (hovered || document.activeElement?.matches(':focus-visible') === true),
          )
        }
      >
        <TooltipTrigger asChild>
          <button
            type="button"
            {...button}
            onPointerEnter={(event) => {
              button.onPointerEnter?.(event);
              setHovered(event.pointerType !== 'touch');
            }}
            onBlur={(event) => {
              button.onBlur?.(event);
              release();
            }}
            onPointerLeave={(event) => {
              button.onPointerLeave?.(event);
              setHovered(false);
              release();
            }}
            className="relative block min-h-11 w-full rounded-control px-3 py-2 text-left outline-none contain-inline-size hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            <Typography
              as="span"
              variant="body-sm"
              className="mb-1 block pr-5 text-content-muted"
              data-context-switcher-label
            >
              {label}
            </Typography>
            <span className="block min-w-0" aria-busy={loading || undefined}>
              {loading ? (
                <Skeleton className="my-0.5 h-4 w-3/4" data-context-switcher-loading />
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <Typography
                    ref={wrapName ? undefined : fitted.ref}
                    as="span"
                    variant="title-sm"
                    className={cn(
                      'min-w-0 flex-1 text-content-primary',
                      wrapName ? 'line-clamp-3 whitespace-normal wrap-anywhere' : 'block truncate',
                    )}
                    data-context-switcher-name={wrapName ? 'wrap' : fitted.mode}
                  >
                    {wrapName || fitted.text === name ? (
                      name
                    ) : (
                      <>
                        <span className="sr-only">{name}</span>
                        <span aria-hidden>{fitted.text}</span>
                      </>
                    )}
                  </Typography>
                  {status ? (
                    <ContextSwitcherStatus status={status} className="shrink-0 whitespace-nowrap" />
                  ) : null}
                </span>
              )}
              {segments.length ? (
                <Typography
                  as="span"
                  variant="body-sm"
                  className="block truncate text-content-secondary"
                  data-context-switcher-segments
                >
                  {segments.join(' · ')}
                </Typography>
              ) : null}
            </span>
            <Icon
              name={ChevronsUpDown}
              size="sm"
              className="absolute right-3 top-2"
              data-context-switcher-icon
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="wrap-anywhere">
          {showName ? <span className="block">{name}</span> : null}
          {note ? <span className="block text-content-secondary">{note}</span> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
