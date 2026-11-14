import type { MouseEvent } from 'react';
import { MenuItem, OverflowMenu } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { OperationalRow } from '../../../shared/operational-list';
import type { TaskListRowView } from './taskListModel';
import { taskRowLine } from './taskRowLine';

export interface TaskRowProps {
  readonly row: TaskListRowView;
  readonly fullTaskHref: string;
  readonly onOpen: (taskId: string) => void;
}

/**
 * A Task of the Tasks page: title, id and Task Type, and one supporting line (the attention reason,
 * else the status line). The title opens the Full Task; there is no selection (bulk actions are
 * deferred).
 */
export function TaskRow({ row, fullTaskHref, onOpen }: TaskRowProps) {
  const { t } = useTranslation();
  const title = row.title ?? row.id;

  return (
    <OperationalRow
      titleAs="span"
      primary={title}
      primaryHref={fullTaskHref}
      onPrimaryClick={(event: MouseEvent) => {
        event.preventDefault();
        onOpen(row.id);
      }}
      compactFacts={[{ text: row.id, mono: true }, row.typeTitle ?? '']}
      supporting={taskRowLine(row, t)}
      trailing={
        <OverflowMenu
          label={row.id}
          triggerLabel={t('specification.taskActionsNamed', { id: row.id })}
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
      }
      dataAttributes={{
        'data-row-task': row.id,
        'data-task-status': row.broken ? 'broken' : row.statusId,
        ...(row.attention || row.blocksSpecification || row.broken
          ? { 'data-task-attention': 'true' }
          : {}),
      }}
    />
  );
}
