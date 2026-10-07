import { Checkbox, cn, fastColorTransitionClassName, Icon, MenuItem, OverflowMenu } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { getTaskStatePresentation, type TaskItem } from './model';
import { scanGrid } from '../overview/geometry';

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

  return (
    <li
      data-row-task={task.id}
      className={cn(
        '@container/task-row group relative min-h-14 min-w-0 rounded-control py-2',
        'border-b border-border-subtle hover:bg-surface-hover',
        selected && 'bg-surface-selected/40',
        fastColorTransitionClassName,
      )}
    >
      <div className={cn(scanGrid, 'w-full max-w-content-standard items-center')} data-task-rail>
        {/* Col 1: utility gutter (32px): Checkbox */}
        <div className="flex h-control-height-default w-full items-center justify-center">
          <Checkbox
            aria-label={t('specification.selectTask', { id: task.id })}
            checked={selected}
            disabled={isPreparing}
            onCheckedChange={(checked) => onSelect(task.id, Boolean(checked))}
          />
        </div>

        {/* Col 2: semantic marker (16px) */}
        <span aria-hidden="true" />

        {/* Col 3: content rail */}
        <div className="flex min-w-0 flex-col gap-y-0.5 pr-2">
          {/* Line 1: Task title button */}
          <button
            type="button"
            onClick={() => onPreview(task.id)}
            className="block w-full text-left font-medium text-body-sm text-content-primary hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-focus-ring [overflow-wrap:anywhere]"
            data-task={task.id}
          >
            {task.title}
          </button>

          {/* Line 2: Stable secondary columns */}
          <div
            className="grid min-w-0 grid-cols-[calc(var(--spacing)*20)_calc(var(--spacing)*28)_minmax(0,1fr)] items-center gap-x-2 text-body-sm text-content-muted"
            data-task-secondary
          >
            <span className="font-mono text-content-secondary" data-task-key>
              {task.id}
            </span>
            <span className="truncate text-content-secondary" data-task-status>
              {task.status}
            </span>
            <div className="flex min-w-0 items-center gap-1.5 truncate" data-task-additional>
              {statePresentation.icon && (
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <Icon
                    name={statePresentation.icon}
                    size="sm"
                    className={cn('shrink-0', statePresentation.iconClassName)}
                  />
                </span>
              )}
              <span className={cn('truncate', statePresentation.textClassName)}>
                {task.additionalInfo ?? ''}
              </span>
            </div>
          </div>
        </div>

        {/* Col 4: bounded action */}
        <div className="relative z-10 self-center">
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
        </div>
      </div>
    </li>
  );
}
