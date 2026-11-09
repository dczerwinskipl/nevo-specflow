import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../../lib';

export interface InformationListLeadingProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `top` (default): a control-height box anchored at the row top, for a control (a checkbox) or a
   * glyph aligned with the first line. `row-center`: a one-line-height box (20px) centred on the
   * whole row at any row height, for a decorative mark that identifies the entire row.
   */
  readonly align?: 'top' | 'row-center';
}

const alignClasses = {
  top: 'h-control-height-default self-start',
  'row-center': 'h-5 self-center',
} as const;

export const InformationListLeading = forwardRef<HTMLDivElement, InformationListLeadingProps>(
  function InformationListLeading({ className, children, align = 'top', ...props }, ref) {
    return (
      <div
        ref={ref}
        data-align={align}
        className={cn(
          'relative z-10 flex w-control-height-compact shrink-0 items-center justify-center',
          alignClasses[align],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
