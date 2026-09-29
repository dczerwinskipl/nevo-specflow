import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { tv } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { typographyTextStyleRef, type TypographyVariant } from '../../../design-system/resources';

export type { TypographyVariant } from '../../../design-system/resources';

export const typographyVariantClasses = {
  'title-lg': 'text-title-lg',
  'title-md': 'text-title-md',
  'title-sm': 'text-title-sm',
  'body-lg': 'text-body-lg',
  'body-md': 'text-body-md',
  'body-sm': 'text-body-sm',
  'label-md': 'text-label-md',
  'label-sm': 'text-label-sm',
  'section-label': 'text-section-label uppercase',
  'code-md': 'font-mono text-code-md',
} as const satisfies Record<TypographyVariant, string>;

export const typographyVariants = tv({
  base: 'font-sans',
  variants: {
    variant: typographyVariantClasses,
  },
  defaultVariants: { variant: 'body-md' },
});

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children?: ReactNode;
  variant?: TypographyVariant;
}

export function Typography({
  as: Component = 'span',
  children,
  className,
  variant = 'body-md',
  ...props
}: TypographyProps) {
  const capture = useDesignMetadata(
    'Typography',
    {},
    {
      textFlow: true,
      textStyleRef: typographyTextStyleRef(variant),
    },
  );
  return (
    <Component className={cn(typographyVariants({ variant }), className)} {...props} {...capture}>
      {children}
    </Component>
  );
}



