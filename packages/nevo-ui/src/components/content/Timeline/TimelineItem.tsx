import { forwardRef, type LiHTMLAttributes } from 'react';
import { tv } from 'tailwind-variants/lite';
import { cn } from '../../../lib';
import { useTimelineSize } from './timelineContext';

export const timelineItemVariants = tv({
  base: 'group/timeline-item relative grid min-w-0 items-stretch',
  variants: {
    size: {
      sm: 'grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5',
      md: 'grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3',
    },
  },
});

export type TimelineItemProps = LiHTMLAttributes<HTMLLIElement>;

export const TimelineItem = forwardRef<HTMLLIElement, TimelineItemProps>(function TimelineItem(
  { className, ...props },
  ref,
) {
  const size = useTimelineSize('Timeline.Item');
  return <li ref={ref} className={cn(timelineItemVariants({ size }), className)} {...props} />;
});
