import {
  Checkbox,
  cn,
  fastColorTransitionClassName,
  Icon,
  MenuItem,
  OverflowMenu,
  Typography,
} from '@nevo/ui';
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
        <div className="pointer-events-none flex min-w-0 flex-col gap-y-1 pr-2">
          {/* Line 1: Task title button */}
          <Typography
            as="h4"
            variant="title-sm"
            className="min-w-0 text-content-primary [overflow-wrap:anywhere]"
            data-task-title
          >
            <button
              type="button"
              onClick={() => onPreview(task.id)}
              className="pointer-events-auto block w-full text-left hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
              data-task={task.id}
            >
              {task.title}
            </button>
          </Typography>

          {/* Line 2: Stable secondary columns */}
          <Typography
            as="div"
            variant="body-sm"
            className="grid min-w-0 grid-cols-[calc(var(--spacing)*18)_calc(var(--spacing)*24)_minmax(0,1fr)] items-baseline gap-x-2 text-content-muted"
            data-task-secondary
          >
            <span
              className="min-w-0 font-mono text-content-secondary [overflow-wrap:anywhere]"
              data-task-key
            >
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
          </Typography>
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
