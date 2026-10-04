import { forwardRef, type HTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';

export const surfaceDefaults = { tone: 'default' } as const;

/**
 * Semantic content surfaces only. Control surfaces stay owned by form controls
 * (`InputGroup`, `TextInput`, Select, etc.) rather than becoming a generic Surface tone.
 */
export const surfaceVariants = tv({
  base: 'text-content-primary',
  variants: {
    tone: {
      default: 'bg-surface',
      raised: 'bg-surface-raised',
      subtle: 'bg-surface-subtle',
    },
  },
  defaultVariants: surfaceDefaults,
});

export type SurfaceTone = NonNullable<VariantProps<typeof surfaceVariants>['tone']>;

export interface SurfaceProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof surfaceVariants> {}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { className, tone = surfaceDefaults.tone, ...props },
  ref,
) {
  const capture = useDesignMetadata('Surface', { tone });

  return (
    <div ref={ref} className={cn(surfaceVariants({ tone }), className)} {...props} {...capture} />
  );
});
