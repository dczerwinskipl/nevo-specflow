import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, cn, hitAreaClassName } from '@nevo/ui';

/**
 * The Contents control of a document's header, region navigation rather than a header action. Its
 * tooltip is always "Contents"; it works in one of two ways:
 * - `sheet` (no contents column on the panel): opens the Contents sheet (`expanded` while it is open);
 * - `toggle` (the column shares its slot): shows or hides the contents column (`pressed` while shown).
 */
export function ContentsButton(
  props:
    | {
        mode: 'sheet';
        expanded: boolean;
        onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
      }
    | { mode: 'toggle'; pressed: boolean; onToggle: () => void },
) {
  const { t } = useTranslation();
  const label = t('documentReading.outline.label');
  const common = {
    icon: 'list',
    size: 'sm',
    variant: 'ghost',
    title: label,
  } as const;

  if (props.mode === 'toggle') {
    return (
      <IconButton
        {...common}
        aria-label={label}
        aria-pressed={props.pressed}
        className={cn(
          'shrink-0 aria-pressed:bg-surface-selected aria-pressed:text-content-primary',
          hitAreaClassName,
        )}
        onClick={props.onToggle}
      />
    );
  }

  return (
    <IconButton
      {...common}
      aria-label={t('documentReading.outline.open')}
      aria-haspopup="dialog"
      aria-expanded={props.expanded}
      className={cn('shrink-0', hitAreaClassName)}
      onClick={props.onOpen}
    />
  );
}
