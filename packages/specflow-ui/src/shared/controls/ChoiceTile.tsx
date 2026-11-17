import { useId, type ReactNode } from 'react';
import {
  choiceSurfaceCheckClassName,
  choiceSurfaceClassName,
  choiceSurfaceTracksClassName,
  cn,
  Icon,
} from '@nevo/ui';

/**
 * A single-choice group of tiles (native radios in `label` cards, the design system's choice
 * surface recipe). The product component the recipe leaves to the consumer: it wires the native
 * radio, its name/description to the tile text and the invisible-check geometry once, so each
 * choice of a form (workspace place, agent provider) only supplies content.
 */
export function ChoiceTileGroup({
  columns,
  className,
  children,
  invalid = false,
  describedBy,
  ...label
}: {
  /** Responsive column classes of the grid, for example `@2xl:grid-cols-3`. */
  readonly columns?: string;
  readonly className?: string;
  readonly children: ReactNode;
  /** The choice blocks the form (`aria-invalid`); `describedBy` names the message that says why. */
  readonly invalid?: boolean;
  readonly describedBy?: string;
} & ({ 'aria-labelledby': string } | { 'aria-label': string })) {
  return (
    <div
      role="radiogroup"
      className={cn('grid items-stretch gap-3', columns, className)}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      {...label}
    >
      {children}
    </div>
  );
}

export interface ChoiceTileProps {
  /** Radio group name shared by the tiles of one group. */
  readonly name: string;
  readonly value?: string;
  readonly checked: boolean;
  readonly onSelect: () => void;
  readonly icon: ReactNode;
  readonly title: ReactNode;
  /** The explanation under the title; it describes the radio for assistive technology. */
  readonly description?: ReactNode;
  /** A row of facts (availability, badges) below the description. */
  readonly meta?: ReactNode;
  /** A last remark below the facts. */
  readonly note?: ReactNode;
  /** Cannot be chosen and is skipped by the keyboard (native `disabled`). */
  readonly disabled?: boolean;
  /** Cannot be chosen but stays reachable so its reason can be read (`aria-disabled`). */
  readonly blocked?: boolean;
  /** Colour of the icon while the tile is available; the muted tone replaces it when not. */
  readonly iconClassName?: string;
  /**
   * `compact`: one 72 px geometry for a short list of named choices (the start screen's agents): a
   * 28 px mark centred on the left (greyed out while unavailable), the title over a one-line
   * description, and the check slot. `meta` and `note` are not shown.
   */
  readonly size?: 'default' | 'compact';
}

export function ChoiceTile({
  name,
  value,
  checked,
  onSelect,
  icon,
  title,
  description,
  meta,
  note,
  disabled = false,
  blocked = false,
  iconClassName,
  size = 'default',
}: ChoiceTileProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const unavailable = disabled || blocked;
  const radio = (
    <input
      className="sr-only"
      type="radio"
      name={name}
      value={value}
      checked={checked}
      disabled={disabled}
      aria-disabled={blocked || undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onChange={() => {
        if (!blocked && !disabled) {
          onSelect();
        }
      }}
    />
  );
  const check = (
    <span className={cn(choiceSurfaceCheckClassName, !checked && 'invisible')} aria-hidden="true">
      <Icon name="check" size="sm" />
    </span>
  );

  if (size === 'compact') {
    return (
      <label
        aria-disabled={blocked || undefined}
        className={cn(
          choiceSurfaceClassName,
          'grid grid-cols-[1.75rem_minmax(0,1fr)_var(--spacing-icon-md)] items-center gap-x-2.5 px-3.5 py-3.5',
        )}
      >
        {radio}
        <span
          className={cn(
            'flex size-7 items-center justify-center',
            unavailable ? 'text-content-muted opacity-60 grayscale' : iconClassName,
          )}
        >
          {icon}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span
            id={titleId}
            className={cn(
              'truncate text-title-md',
              unavailable ? 'text-content-secondary' : 'text-content-primary',
            )}
          >
            {title}
          </span>
          {/* One line by contract: the consumer keeps the description short. */}
          {description ? (
            <span
              id={descriptionId}
              className="flex h-4 items-center gap-1.5 overflow-hidden text-body-sm whitespace-nowrap text-content-secondary"
            >
              {description}
            </span>
          ) : null}
        </span>
        {check}
      </label>
    );
  }

  return (
    <label
      aria-disabled={blocked || undefined}
      className={cn(choiceSurfaceClassName, choiceSurfaceTracksClassName)}
    >
      {radio}
      <span className={cn(unavailable ? 'text-content-muted' : iconClassName)}>{icon}</span>
      <span className="min-w-0 break-words">
        <strong
          id={titleId}
          className={cn(
            'block text-title-sm',
            unavailable ? 'text-content-secondary' : 'text-content-primary',
          )}
        >
          {title}
        </strong>
        {description ? (
          <span id={descriptionId} className="mt-1 block text-body-sm text-content-secondary">
            {description}
          </span>
        ) : null}
        {meta ? (
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-content-secondary">
            {meta}
          </span>
        ) : null}
        {note ? (
          <span className="mt-1 block text-body-sm text-content-secondary">{note}</span>
        ) : null}
      </span>
      {check}
    </label>
  );
}
