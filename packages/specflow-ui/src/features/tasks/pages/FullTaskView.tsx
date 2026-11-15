import type { ReactNode } from 'react';
import type { FullTaskData } from '../read-model/model';
import { TaskDetails } from '../detail/TaskDetails';
export interface FullTaskViewProps {
  readonly task: FullTaskData;
  readonly specKey: string;
  readonly onOpenSession?: (sessionId: string) => void;
  readonly children?: ReactNode;
}
/** The Task page's reading column. The way back is the page's header Back (Narrow) or its trail. */
export function FullTaskView({ task, specKey, children }: FullTaskViewProps) {
  return (
    <div className="grid min-w-0 max-w-content-standard gap-4">
      {children ?? <TaskDetails task={task} specKey={specKey} />}
    </div>
  );
}
