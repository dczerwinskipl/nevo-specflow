import { Checkbox, MenuItem, OverflowMenu } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { OperationalRow } from '../../shared/OperationalList';
import type { TaskItem } from '../model';
import { getTaskStatePresentation } from './presentation';

export interface TaskRowProps {
  readonly task: TaskItem;
  readonly selected: boolean;
  readonly isPreparing?: boolean;
  readonly onSelect: (id: string, selected: boolean) => void;
  readonly onPreview: (id: string) => void;
  readonly fullTaskHref: string;
}

export function TaskRow({
  task,
  selected,
  isPreparing = false,
  onSelect,
  onPreview,
  fullTaskHref,
}: TaskRowProps) {
  const { t } = useTranslation();
  const statePresentation = getTaskStatePresentation(task);

  const leading = (
    <Checkbox
      aria-label={t('specification.selectTask', { id: task.id })}
      checked={selected}
      disabled={isPreparing}
      onCheckedChange={(checked) => onSelect(task.id, Boolean(checked))}
    />
  );

  const trailing = (
    <OverflowMenu
      label={task.id}
      triggerLabel={t('specification.taskActionsNamed', { id: task.id })}
    >
      <MenuItem
        leadingIcon="open-full"
        onSelect={() => {
          window.open(fullTaskHref, '_blank', 'noopener,noreferrer');
        }}
      >
        {t('specification.openTaskNewWindow')}
      </MenuItem>
    </OverflowMenu>
  );

  return (
    <OperationalRow
      primary={task.title}
      onPrimaryClick={() => onPreview(task.id)}
      primaryAriaLabel={task.title}
      compactFacts={[{ text: task.id, mono: true }, task.status]}
      supporting={
        task.additionalInfo
          ? {
              text: task.additionalInfo,
              tone:
                statePresentation.icon === 'triangle-alert'
                  ? 'attention'
                  : statePresentation.icon === 'loader'
                    ? 'info'
                    : statePresentation.icon === 'circle-check'
                      ? 'success'
                      : undefined,
              icon: statePresentation.icon,
              iconClassName: statePresentation.iconClassName,
              textClassName: statePresentation.textClassName,
            }
          : undefined
      }
      leading={leading}
      marker={true}
      trailing={trailing}
      selected={selected}
      dataAttributes={{
        'data-row-task': task.id,
        'data-task-title': 'true',
        'data-task-key': task.id,
        'data-task-status': task.status,
      }}
    />
  );
}
