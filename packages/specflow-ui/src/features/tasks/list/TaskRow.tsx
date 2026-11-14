import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { OperationalRow } from '../../../shared/operational-list';
import { needsPerson } from './presentation';
import type { TaskListRowView } from './taskListModel';
import { taskRowLine } from './taskRowLine';

export interface TaskRowProps {
  readonly row: TaskListRowView;
  readonly fullTaskHref: string;
  readonly onOpen: (taskId: string) => void;
}

/**
 * A Task of the Tasks page: title, id and Task Type, and one supporting line (the attention reason,
 * else the status line). The title is a real link to the Full Task (a new window from the browser's
 * own link menu). No row menu until the row offers lifecycle actions, and no selection (bulk
 * actions are deferred).
 */
export function TaskRow({ row, fullTaskHref, onOpen }: TaskRowProps) {
  const { t } = useTranslation();

  return (
    <OperationalRow
      titleAs="span"
      primary={row.title ?? row.id}
      primaryHref={fullTaskHref}
      onPrimaryClick={(event: MouseEvent) => {
        // A modified click keeps the browser's own behaviour (a new tab or window).
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
          return;
        }

        event.preventDefault();
        onOpen(row.id);
      }}
      compactFacts={[{ text: row.id, mono: true }, row.typeTitle ?? '']}
      supporting={taskRowLine(row, t)}
      dataAttributes={{
        'data-row-task': row.id,
        'data-task-status': row.broken ? 'broken' : row.statusId,
        ...(needsPerson(row) ? { 'data-task-attention': 'true' } : {}),
      }}
    />
  );
}
