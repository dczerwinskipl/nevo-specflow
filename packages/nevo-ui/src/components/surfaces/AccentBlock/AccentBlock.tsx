import { forwardRef, type HTMLAttributes } from 'react';
import { tv } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';

export const accentBlockRecipe = tv({
  base: 'min-w-0 border-l-[3px] border-action-primary bg-surface-subtle p-4 text-content-primary [overflow-wrap:anywhere]',
});

/**
 * The flush band: the block spans the `AppWorkspaceBody` padding to the sheet edges, and its inline
 * padding is the page gutter, so the text lines up with the rest of the page (3 px bar + the rest of
 * the gutter on the left, the gutter on the right). Geometry comes from the body's
 * `--app-body-padding-inline`, never from a copied length. Vertical padding stays the card's.
 * The text inset never drops below 12 px (`--spacing(3)`, the smallest body gutter): with no body
 * padding (`none`) or no `AppWorkspaceBody` around it the band does not bleed and its text keeps
 * an inset instead of touching the edge.
 */
// Literal class names: Tailwind finds them in the source.
const flushBand =
  'mx-[calc(var(--app-body-padding-inline,0px)*-1)] pr-[max(var(--app-body-padding-inline,0px),--spacing(3))] pl-[calc(max(var(--app-body-padding-inline,0px),--spacing(3))_-_3px)]';
const flushBandBelowNarrowContent =
  '@max-[40rem]/app-content:mx-[calc(var(--app-body-padding-inline,0px)*-1)] @max-[40rem]/app-content:pr-[max(var(--app-body-padding-inline,0px),--spacing(3))] @max-[40rem]/app-content:pl-[calc(max(var(--app-body-padding-inline,0px),--spacing(3))_-_3px)]';

export interface AccentBlockProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Render as a flush band across the `AppWorkspaceBody` padding instead of a card inside it.
   * `true` always; `'narrow'` only while the enclosing `AppContentContainer` is narrower than 40rem
   * (a CSS container query: the card above, the band below). Requires an `AppWorkspaceBody`
   * ancestor, which defines `--app-body-padding-inline`.
   */
  bleed?: boolean | 'narrow';
}

/** Neutral grouping surface. The consumer owns heading and region semantics. */
export const AccentBlock = forwardRef<HTMLDivElement, AccentBlockProps>(function AccentBlock(
  { bleed = false, className, children, ...props },
  ref,
) {
  const capture = useDesignMetadata('AccentBlock', {});

  return (
    <div
      ref={ref}
      className={cn(
        accentBlockRecipe(),
        bleed === true && flushBand,
        bleed === 'narrow' && flushBandBelowNarrowContent,
        className,
      )}
      data-accent-bleed={bleed === false ? undefined : String(bleed)}
      {...props}
      {...capture}
    >
      <div data-design-slot="content" className="min-w-0">
        {children}
      </div>
    </div>
  );
});
