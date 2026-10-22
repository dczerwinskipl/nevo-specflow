import { IconButton } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { TaskGroup, TaskItem } from '../read-model/model';
import { TaskContent } from '../detail/TaskContent';
import type { TaskDetailsProps } from '../detail/TaskDetails';
import { useLayoutEffect, useRef } from 'react';
import { useTaskViewState } from '../detail/TaskViewState';
import { descriptionScrollOwner, restoreScrollPosition } from '../../documents';

export interface TaskPreviewProps {
  readonly task: TaskItem;
  readonly groups: readonly TaskGroup[];
  readonly specKey: string;
  readonly onClose?: () => void;
  readonly onOpenFull: (taskId: string) => void;
  readonly onInspect?: TaskDetailsProps['onInspect'];
  readonly onOpenResource?: TaskDetailsProps['onOpenResource'];
}
export function TaskPreview({
  task,
  specKey,
  onClose,
  onInspect,
  onOpenResource,
}: TaskPreviewProps) {
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  const { state, saveScroll } = useTaskViewState(task.id);
  const initialScroll = useRef(state.scrollTop ?? 0);
  const preparedNavigation = useRef(false);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    // The workspace resets its mobile viewport and restores the opener in the next frame, and a
    // preserved long description lays out after mounting. Keep restoring until the position
    // holds instead of assuming a fixed number of frames.
    const stopRestoring = restoreScrollPosition(node, () => initialScroll.current);
    return () => {
      stopRestoring();
      if (!preparedNavigation.current) saveScroll(descriptionScrollOwner(node).scrollTop);
    };
  }, [saveScroll]);
  const rememberScroll = () => {
    if (!root.current) return;
    preparedNavigation.current = true;
    saveScroll(descriptionScrollOwner(root.current).scrollTop);
  };
  return (
    <aside ref={root} className="min-w-0 p-4" aria-label={t('specification.taskPreviewAriaLabel')}>
      {onClose ? (
        <IconButton
          icon="close"
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label={t('specification.closeTaskPreview')}
        />
      ) : null}
      <TaskContent
        task={task}
        specKey={specKey}
        preview
        onInspect={
          onInspect
            ? (page, id) => {
                rememberScroll();
                onInspect(page, id);
              }
            : undefined
        }
        onOpenResource={
          onOpenResource
            ? (resource) => {
                rememberScroll();
                onOpenResource(resource);
              }
            : undefined
        }
      />
    </aside>
  );
}
