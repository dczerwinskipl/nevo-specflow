import { DateInput, DateSegment, type DateInputProps } from 'react-aria-components';
import { cn } from '../../../../lib';
import {
  dateControlClassName,
  dateInputClassName,
  dateLiteralClassName,
  dateSegmentClassName,
} from './dateTime.styles';

export interface DateSegmentsProps extends Omit<DateInputProps, 'children' | 'className'> {
  className?: string;
  standalone?: boolean;
}

type DateInputSegment = Parameters<DateInputProps['children']>[0];

export function DateSegments({ className, standalone = false, ...props }: DateSegmentsProps) {
  return (
    <DateInput
      {...props}
      className={cn(standalone ? dateControlClassName : dateInputClassName, className)}
    >
      {(segment: DateInputSegment) => (
        <DateSegment
          segment={segment}
          className={segment.type === 'literal' ? dateLiteralClassName : dateSegmentClassName}
        />
      )}
    </DateInput>
  );
}
