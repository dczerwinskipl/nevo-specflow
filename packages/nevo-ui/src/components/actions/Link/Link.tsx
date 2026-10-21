import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  fastColorTransitionClassName,
  hitAreaClassName,
} from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';

export const linkDefaults = { tone: 'default', layout: 'inline' } as const;

export const linkVariants = tv({
  base: `cursor-pointer rounded-control-inline underline-offset-2 hover:underline focus-visible:underline ${fastColorTransitionClassName}`,
  variants: {
    layout: {
      /** Link inside a sentence or paragraph: exempt from the target-size floor (WCAG 2.5.8). */
      inline: '',
      /** Link that stands alone in its own row or toolbar: its box is at least the target size (24px / 44px on coarse pointers), so neighbours cannot cover its hit area. */
      standalone: `inline-flex min-h-(--target-size) items-center ${hitAreaClassName}`,
    },
    tone: {
      default: 'text-content-link hover:text-content-link-hover',
      muted: 'text-content-secondary hover:text-content-primary',
    },
  },
  defaultVariants: linkDefaults,
});

/**
 * The label wrapper. A standalone link may lead with an icon, so its label is the flex row that
 * centres icon and text on the same axis and inherits the anchor's `gap`. Inline links keep a
 * plain inline span so they flow inside a sentence.
 */
export const linkLabelVariants = tv({
  variants: {
    layout: {
      inline: '',
      standalone: 'inline-flex min-w-0 items-center gap-[inherit]',
    },
  },
  defaultVariants: { layout: linkDefaults.layout },
});

export interface LinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof linkVariants> {}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { children, className, layout = linkDefaults.layout, tone = linkDefaults.tone, ...props },
  ref,
) {
  const capture = useDesignMetadata('Link', { tone, layout });

  return (
    <a ref={ref} className={cn(linkVariants({ tone, layout }), className)} {...props} {...capture}>
      <span className={linkLabelVariants({ layout })} {...designSlot('Link', 'label')}>
        {children}
      </span>
    </a>
  );
});
