import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  actionVariantClasses,
  fastColorTransitionClassName,
} from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { Icon, type IconGlyph } from '../../foundations/Icon';

export const iconButtonDefaults = { variant: 'ghost', size: 'md' } as const;

export const iconButtonVariants = tv({
  base: `inline-flex shrink-0 cursor-pointer items-center justify-center border border-solid disabled:pointer-events-none disabled:opacity-50 ${fastColorTransitionClassName}`,
  variants: {
    variant: {
      ...actionVariantClasses,
    },
    size: {
      xs: 'size-control-height-inline rounded-control-inline',
      sm: 'size-control-height-compact rounded-control',
      md: 'size-control-height-default rounded-control',
    },
  },
  defaultVariants: iconButtonDefaults,
});

export type IconButtonVariant = NonNullable<VariantProps<typeof iconButtonVariants>['variant']>;
export type IconButtonSize = NonNullable<VariantProps<typeof iconButtonVariants>['size']>;

export interface IconButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>,
    VariantProps<typeof iconButtonVariants> {
  'aria-label': string;
  icon: IconGlyph;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    'aria-label': ariaLabel,
    className,
    disabled,
    icon,
    size = iconButtonDefaults.size,
    type = 'button',
    variant = iconButtonDefaults.variant,
    ...props
  },
  ref,
) {
  const capture = useDesignMetadata('IconButton', {
    variant,
    size,
    state: disabled ? 'disabled' : 'default',
  });
  const iconSize = size === 'md' ? 'md' : 'sm';

  return (
    <button
      ref={ref}
      aria-label={ariaLabel}
      className={cn(iconButtonVariants({ variant, size }), className)}
      disabled={disabled}
      type={type}
      {...props}
      {...capture}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center text-current"
        {...designSlot('IconButton', 'icon')}
      >
        <Icon name={icon} size={iconSize} />
      </span>
    </button>
  );
});
