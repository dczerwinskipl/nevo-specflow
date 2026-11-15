import type { ComponentPropsWithRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Typography, cn } from '@nevo/ui';
import { ContextSwitcherDetails, type ContextSwitcherDetail } from './ContextSwitcherDetails';

/**
 * One option of a context switcher's listbox: the name wrapping anywhere, its detail lines and, on
 * the selected one, "Selected" with a check. An `unavailable` option stays focusable and announced
 * (`aria-disabled`) with a muted name; the caller gives the reason as an `attention` detail and
 * ignores its activation.
 */
export function ContextSwitcherOption({
  name,
  details = [],
  selected,
  unavailable = false,
  ...button
}: {
  name: string;
  details?: readonly ContextSwitcherDetail[];
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
        <ContextSwitcherDetails
          details={selected ? [...details, { text: t('common.selected') }] : details}
        />
      </span>
      {selected ? <Icon name="check" size="sm" /> : null}
    </button>
  );
}
