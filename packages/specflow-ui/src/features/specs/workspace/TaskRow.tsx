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
import type { TaskItem } from './model';

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

  return (
    <div
      data-row-task={task.id}
      className={cn(
        'group grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border-subtle py-3.5',
        selected && 'bg-surface-selected/40',
        fastColorTransitionClassName,
      )}
    >
      <div className="pt-1">
        <Checkbox
          aria-label={t('specification.selectTask', { id: task.id })}
          checked={selected}
          disabled={isPreparing}
          onCheckedChange={(checked) => onSelect(task.id, Boolean(checked))}
        />
      </div>

      <div className="min-w-0">
        <button
          type="button"
          onClick={() => onPreview(task.id)}
          className="block w-full text-left font-medium text-content-primary hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2 [overflow-wrap:anywhere]"
          data-task={task.id}
        >
          {task.title}
        </button>

        <Typography
          as="div"
          variant="body-sm"
          className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-content-muted"
        >
          <span className="font-mono text-content-secondary" data-task-key>
            {task.id}
          </span>
          <span className="text-content-secondary" data-task-status>
            {task.status}
          </span>
          {task.additionalInfo ? (
            <span className="text-content-muted" data-task-additional>
              {task.additionalInfo}
            </span>
          ) : null}
        </Typography>
      </div>

      <div className="flex items-center gap-1">
        <a
          href={fullTaskHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-control text-content-secondary hover:bg-surface-hover hover:text-content-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
          title={t('specification.openTaskNewWindow')}
          aria-label={t('specification.openTaskNewWindowNamed', { id: task.id })}
        >
          <Icon name="open-full" size="sm" />
        </a>

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
  );
}
