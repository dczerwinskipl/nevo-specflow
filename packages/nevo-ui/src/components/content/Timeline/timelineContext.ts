import { createContext, useContext } from 'react';
import type { TimelineSize } from './timelineContract';

export const TimelineSizeContext = createContext<TimelineSize | null>(null);

export function useTimelineSize(part: string): TimelineSize {
  const size = useContext(TimelineSizeContext);
  if (!size) throw new Error(`${part} must be rendered inside Timeline.`);
  return size;
}

