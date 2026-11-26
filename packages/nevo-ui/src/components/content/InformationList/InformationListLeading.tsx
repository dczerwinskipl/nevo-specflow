import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../../lib';

export interface InformationListLeadingProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `top` (default): a control-height box anchored at the row top, for a control (a checkbox) or a
   * glyph aligned with the first line. `first-line`: a one-line-height box (20px) on the row's first
   * text line at any row height, for a decorative mark beside content that can run to many lines.
   * `center`: the same box centred on the row, for a decorative mark that identifies a short row (a
   * title and one line of facts).
   */
  readonly align?: 'top' | 'first-line' | 'center';
}

const alignClasses = {
  top: 'h-control-height-default self-start',
  'first-line': 'h-5 self-start',
  center: 'h-5 self-center',
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
