import type { ComponentPropsWithRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Typography, cn } from '@nevo/ui';
import { ContextSwitcherStatus, type ContextSwitcherStatusValue } from './ContextSwitcherStatus';

/**
 * One option of a context switcher's listbox, the touch path to everything the trigger shortens:
 * the name wrapping in full, its segments joined by " · " and wrapping, the same status slot as the
 * trigger on its own line and, on the selected one, "Selected" with a check. An `unavailable` option
 * stays focusable and announced (`aria-disabled`) with a muted name; the caller gives the reason as
 * a `danger` status and ignores its activation.
 */
export function ContextSwitcherOption({
  name,
  segments = [],
  status,
  selected,
  unavailable = false,
  ...button
}: {
  name: string;
  segments?: readonly string[];
  status?: ContextSwitcherStatusValue;
  selected: boolean;
  unavailable?: boolean;
} & Omit<ComponentPropsWithRef<'button'>, 'children' | 'name' | 'role' | 'className'>) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={unavailable || undefined}
      {...button}
      className={cn(
        'flex min-h-11 items-start gap-2 rounded-control px-2 py-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus-ring aria-selected:bg-surface-selected',
        unavailable ? 'cursor-not-allowed' : 'hover:bg-surface-hover',
      )}
    >
      <span className="min-w-0 flex-1">
        <Typography
          as="span"
          variant="title-sm"
          className={cn(
            'block whitespace-normal [overflow-wrap:anywhere]',
            unavailable ? 'text-content-muted' : 'text-content-primary',
          )}
        >
          {name}
        </Typography>
        {segments.length ? (
          <Typography as="span" variant="body-sm" className="block text-content-secondary">
            {segments.join(' · ')}
          </Typography>
        ) : null}
        {status ? <ContextSwitcherStatus status={status} /> : null}
        {selected ? (
          <Typography as="span" variant="body-sm" className="block text-content-secondary">
            {t('common.selected')}
          </Typography>
        ) : null}
      </span>
      {selected ? <Icon name="check" size="sm" /> : null}
    </button>
  );
}
