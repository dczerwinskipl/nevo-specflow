import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, choiceSurfaceClassName, Icon, Typography } from '@nevo/ui';
import { FlowParentBack } from '../../../../app/navigation/ApplicationLocation';
import { useMessage } from '../../../../i18n/message';
import type { CreateEntryPoint, CreateEntryPointId } from '../start/entryPoints';

/**
 * The start screen of a new Specification: one whole-tile action per entry point, in the order of
 * the list (no radio, no selection state, no Continue: a tap opens that way's form). An entry that
 * cannot be used now is disabled and greyed out, and what `unavailable` renders under it says why
 * and how to fix it.
 */
export function CreateMethodChoice({
  entryPoints,
  onChoose,
  unavailable,
}: {
  entryPoints: readonly CreateEntryPoint[];
  onChoose: (id: CreateEntryPointId) => void;
  /** Why an entry cannot be used now (the tile is disabled), rendered under its tile. */
  unavailable?: Partial<Record<CreateEntryPointId, ReactNode>>;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const reasonId = useId();

  return (
    <div className="grid gap-6">
      <FlowParentBack view="new-specification" />
      <header className="grid gap-2">
        <Typography as="h1" variant="title-lg">
          {t('create.start.title')}
        </Typography>
      </header>
      <ul className="m-0 grid list-none items-stretch gap-4 p-0 @2xl:grid-cols-2">
        {entryPoints.map((entry) => {
          const reason = unavailable?.[entry.id];
          const disabled = reason !== undefined && reason !== null;
          const describedBy = disabled ? `${reasonId}-${entry.id}` : undefined;

          return (
            <li key={entry.id} className="grid content-start gap-2">
              <button
                type="button"
                aria-disabled={disabled || undefined}
                aria-describedby={describedBy}
                className={cn(choiceSurfaceClassName, 'grid')}
                onClick={() => {
                  if (!disabled) {
                    onChoose(entry.id);
                  }
                }}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    name={entry.icon}
                    className={disabled ? 'text-content-muted' : 'text-status-info'}
                  />
                  <span className="grid min-w-0 gap-1 break-words">
                    <strong
                      className={cn(
                        'block text-title-sm',
                        disabled ? 'text-content-muted' : undefined,
                      )}
                    >
                      {text(entry.title)}
                    </strong>
                    <span
                      className={cn(
                        'block text-body-sm',
                        disabled ? 'text-content-muted' : 'text-content-secondary',
                      )}
                    >
                      {text(entry.text)}
                    </span>
                  </span>
                </span>
              </button>
              {disabled && (
                <div id={describedBy} className="px-1">
                  {reason}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
