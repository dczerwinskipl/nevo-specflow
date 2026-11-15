import type { ComponentPropsWithRef } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Icon, Skeleton, Typography } from '@nevo/ui';
import { ContextSwitcherDetails, type ContextSwitcherDetail } from './ContextSwitcherDetails';

/**
 * The trigger of a context switcher (the current Specification, the workspace being read): a quiet
 * label, the current name wrapping anywhere, its detail lines and the up-down glyph. Rendered as the
 * `PopoverTrigger asChild` child, so the popover's props and ref land on the button.
 */
export function ContextSwitcherTrigger({
  label,
  name,
  details = [],
  loading = false,
  ...button
}: {
  label: string;
  name: string;
  details?: readonly ContextSwitcherDetail[];
  /** The current context has not settled yet: a neutral placeholder instead of the name. */
  loading?: boolean;
} & Omit<ComponentPropsWithRef<'button'>, 'children' | 'name' | 'className'>) {
  return (
    <button
      type="button"
      {...button}
      className="relative block min-h-11 w-full rounded-control px-3 py-2 text-left outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
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
          <Typography
            as="span"
            variant="title-sm"
            className="block whitespace-normal text-content-primary [overflow-wrap:anywhere]"
          >
            {name}
          </Typography>
        )}
        <ContextSwitcherDetails details={details} />
      </span>
      <Icon
        name={ChevronsUpDown}
        size="sm"
        className="absolute right-3 top-2"
        data-context-switcher-icon
      />
    </button>
  );
}
