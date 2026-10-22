import { createContext, forwardRef, useContext, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../../lib';

/**
 * - `aligned`: all terms share one column and every detail starts at the same edge (facts of one
 *   thing, a key/value table);
 * - `inline`: each item is one wrapping line, term then detail (a few diagnostic facts in a narrow
 *   region).
 */
export type DescriptionListLayout = 'aligned' | 'inline';

const LayoutContext = createContext<DescriptionListLayout>('aligned');

const rootClasses = {
  aligned: 'grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2',
  inline: 'grid gap-1',
} as const satisfies Record<DescriptionListLayout, string>;

const itemClasses = {
  aligned: 'contents',
  inline: 'flex min-w-0 flex-wrap gap-x-2',
} as const satisfies Record<DescriptionListLayout, string>;

export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {
  layout?: DescriptionListLayout;
}

const DescriptionListRoot = forwardRef<HTMLDListElement, DescriptionListProps>(
  function DescriptionList({ children, className, layout = 'aligned', ...props }, ref) {
    return (
      <LayoutContext.Provider value={layout}>
        <dl
          ref={ref}
          className={cn('m-0 min-w-0 text-body-sm', rootClasses[layout], className)}
          {...props}
        >
          {children}
        </dl>
      </LayoutContext.Provider>
    );
  },
);

/** One term/detail pair. A `div` group keeps the pair together for styling and assistive tech. */
const DescriptionListItem = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DescriptionListItem({ className, ...props }, ref) {
    const layout = useContext(LayoutContext);
    return <div ref={ref} className={cn(itemClasses[layout], className)} {...props} />;
  },
);

const DescriptionListTerm = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function DescriptionListTerm({ className, ...props }, ref) {
    const layout = useContext(LayoutContext);
    return (
      <dt
        ref={ref}
        className={cn(
          'min-w-0 text-content-muted wrap-anywhere',
          layout === 'aligned' && 'max-w-48',
          className,
        )}
        {...props}
      />
    );
  },
);

export interface DescriptionListDetailProps extends HTMLAttributes<HTMLElement> {
  /** `secondary` reads as a default value, `primary` as one the reader chose or should notice. */
  emphasis?: 'primary' | 'secondary';
  /** A quiet remark under the value (a caveat about it). */
  note?: ReactNode;
}

const DescriptionListDetail = forwardRef<HTMLElement, DescriptionListDetailProps>(
  function DescriptionListDetail(
    { children, className, emphasis = 'primary', note, ...props },
    ref,
  ) {
    return (
      <dd ref={ref} className={cn('m-0 min-w-0 wrap-anywhere', className)} {...props}>
        <span
          className={emphasis === 'primary' ? 'text-content-primary' : 'text-content-secondary'}
        >
          {children}
        </span>
        {note ? <span className="mt-0.5 block text-content-muted">{note}</span> : null}
      </dd>
    );
  },
);

/**
 * Terms and their details (`dl`): the facts of one thing. Compose `Item` groups of one `Term` and
 * one `Detail`. Not a table (no header row, no sorting) and not a list of links; for scannable
 * collections of entities use `InformationList`.
 */
export const DescriptionList = Object.assign(DescriptionListRoot, {
  Item: DescriptionListItem,
  Term: DescriptionListTerm,
  Detail: DescriptionListDetail,
});
