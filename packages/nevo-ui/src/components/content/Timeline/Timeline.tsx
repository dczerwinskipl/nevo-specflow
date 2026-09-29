import { forwardRef, type OlHTMLAttributes } from 'react';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { TimelineContent } from './TimelineContent';
import { TimelineItem } from './TimelineItem';
import { TimelineMarker } from './TimelineMarker';
import { timelineDefaults, type TimelineSize } from './timelineContract';
import { TimelineSizeContext } from './timelineContext';

export { timelineDefaults, timelineSizes, type TimelineSize } from './timelineContract';
export const timelineRootClassName = 'm-0 flex min-w-0 list-none flex-col p-0';

export interface TimelineProps extends OlHTMLAttributes<HTMLOListElement> {
  size?: TimelineSize;
}

const TimelineRoot = forwardRef<HTMLOListElement, TimelineProps>(function TimelineRoot(
  { children, className, size = timelineDefaults.size, ...props },
  ref,
) {
  const resolvedSize = size ?? timelineDefaults.size;
  const capture = useDesignMetadata('Timeline', { size: resolvedSize });

  return (
    <TimelineSizeContext.Provider value={resolvedSize}>
      <ol ref={ref} className={cn(timelineRootClassName, className)} {...props} {...capture}>
        {children}
      </ol>
    </TimelineSizeContext.Provider>
  );
});

export const Timeline = Object.assign(TimelineRoot, {
  Item: TimelineItem,
  Marker: TimelineMarker,
  Content: TimelineContent,
});



