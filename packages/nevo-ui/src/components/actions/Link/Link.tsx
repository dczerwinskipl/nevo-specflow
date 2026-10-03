import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { fastColorTransitionClassName } from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';

export const linkDefaults = { tone: 'default' } as const;

export const linkVariants = tv({
  base: `cursor-pointer rounded-control-inline underline-offset-2 hover:underline focus-visible:underline ${fastColorTransitionClassName}`,
  variants: {
    tone: {
      default: 'text-content-link hover:text-content-link-hover',
      muted: 'text-content-secondary hover:text-content-primary',
    },
  },
  defaultVariants: linkDefaults,
});

export interface LinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof linkVariants> {}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { children, className, tone = linkDefaults.tone, ...props },
  ref,
) {
  const capture = useDesignMetadata('Link', { tone });

  return (
    <a ref={ref} className={cn(linkVariants({ tone }), className)} {...props} {...capture}>
      <span {...designSlot('Link', 'label')}>{children}</span>
    </a>
  );
});
