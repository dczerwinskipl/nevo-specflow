import { forwardRef, type HTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';

export const separatorDefaults = { orientation: 'horizontal' } as const;

export const separatorVariants = tv({
  base: 'shrink-0 bg-divider',
  variants: {
    orientation: {
      horizontal: 'h-px w-full',
      vertical: 'h-full min-h-4 w-px self-stretch',
    },
  },
  defaultVariants: separatorDefaults,
});

export interface SeparatorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'role'>, VariantProps<typeof separatorVariants> {}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, orientation = separatorDefaults.orientation, ...props },
  ref,
) {
  const capture = useDesignMetadata('Separator', { orientation });

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(separatorVariants({ orientation }), className)}
      {...props}
      {...capture}
    />
  );
});
