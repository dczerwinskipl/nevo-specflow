import type { ReactNode } from 'react';
import type { FullTaskData } from '../read-model/model';
export interface FullTaskViewProps {
  readonly task: FullTaskData;
  readonly specKey: string;
  readonly children: ReactNode;
}
/** The Task page's reading column. The way back is the page's header Back (Narrow) or its trail. */
export function FullTaskView({ children }: FullTaskViewProps) {
  return <div className="grid min-w-0 max-w-content-standard gap-4">{children}</div>;
}
