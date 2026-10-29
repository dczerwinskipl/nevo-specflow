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
  ...label
}: {
  /** Responsive column classes of the grid, for example `@2xl:grid-cols-3`. */
  readonly columns?: string;
  readonly className?: string;
  readonly children: ReactNode;
} & ({ 'aria-labelledby': string } | { 'aria-label': string })) {
  return (
    <div
      role="radiogroup"
      className={cn('grid items-stretch gap-3', columns, className)}
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
}: ChoiceTileProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const unavailable = disabled || blocked;

  return (
    <label
      aria-disabled={blocked || undefined}
      className={cn(choiceSurfaceClassName, choiceSurfaceTracksClassName)}
    >
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
      <span className={cn(choiceSurfaceCheckClassName, !checked && 'invisible')} aria-hidden="true">
        <Icon name="check" size="sm" />
      </span>
    </label>
  );
}
