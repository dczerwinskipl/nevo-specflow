import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  type ElementType,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { tv } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
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

interface TypographyOwnProps<Component extends ElementType> {
  as?: Component;
  children?: ReactNode;
  variant?: TypographyVariant;
}

export type TypographyProps<Component extends ElementType = 'span'> =
  TypographyOwnProps<Component> &
    Omit<ComponentPropsWithoutRef<Component>, keyof TypographyOwnProps<Component>>;

type TypographyComponent = <Component extends ElementType = 'span'>(
  props: TypographyProps<Component> & { ref?: ComponentPropsWithRef<Component>['ref'] },
) => ReactElement | null;

type TypographyImplementationProps = TypographyOwnProps<ElementType> &
  Omit<ComponentPropsWithoutRef<'span'>, keyof TypographyOwnProps<ElementType>>;

const TypographyWithRef = forwardRef<HTMLElement, TypographyImplementationProps>(
  function Typography(
    { as, children, className, variant = 'body-md', ...props },
    ref: ForwardedRef<HTMLElement>,
  ) {
    const ResolvedComponent = as ?? 'span';
    const capture = useDesignMetadata(
      'Typography',
      {},
      {
        textFlow: true,
        textStyleRef: typographyTextStyleRef(variant),
      },
    );
    return (
      <ResolvedComponent
        ref={ref}
        className={cn(typographyVariants({ variant }), className)}
        {...props}
        {...capture}
      >
        {children}
      </ResolvedComponent>
    );
  },
);

export const Typography = TypographyWithRef as TypographyComponent;
