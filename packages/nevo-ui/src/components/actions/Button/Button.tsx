import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  actionVariantClasses,
  fastColorTransitionClassName,
} from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { Icon, type IconName } from '../../foundations/Icon';
import { Typography, type TypographyVariant } from '../../foundations/Typography';

export const buttonDefaults = { variant: 'primary', size: 'md', width: 'content' } as const;

export const buttonVariants = tv({
  base: `inline-flex cursor-pointer items-center justify-center whitespace-nowrap border border-solid disabled:pointer-events-none disabled:opacity-50 ${fastColorTransitionClassName}`,
  variants: {
    variant: {
      ...actionVariantClasses,
    },
    size: {
      sm: 'h-control-height-compact gap-1.5 rounded-control px-control-padding-compact',
      md: 'h-control-height-default gap-2 rounded-control px-control-padding-default',
    },
    width: {
      content: 'w-fit',
      full: 'w-full',
    },
  },
  defaultVariants: buttonDefaults,
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;
export type ButtonWidth = NonNullable<VariantProps<typeof buttonVariants>['width']>;

const labelTypographyBySize = {
  sm: 'label-sm',
  md: 'label-md',
} satisfies Record<ButtonSize, TypographyVariant>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  leadingIcon?: IconName;
  trailingIcon?: IconName;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    leadingIcon,
    size = buttonDefaults.size,
    trailingIcon,
    type = 'button',
    variant = buttonDefaults.variant,
    width = buttonDefaults.width,
    ...props
  },
  ref,
) {
  const capture = useDesignMetadata('Button', {
    variant,
    size,
    width,
    state: disabled ? 'disabled' : 'default',
  });
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, width }), className)}
      disabled={disabled}
      type={type}
      {...props}
      {...capture}
    >
      {leadingIcon ? (
        <span
          className="inline-flex shrink-0 items-center justify-center text-current"
          {...designSlot('Button', 'leadingIcon')}
        >
          <Icon name={leadingIcon} size={size} />
        </span>
      ) : null}
      <Typography
        className="block text-current"
        {...designSlot('Button', 'label')}
        variant={labelTypographyBySize[size]}
      >
        {children}
      </Typography>
      {trailingIcon ? (
        <span
          className="inline-flex shrink-0 items-center justify-center text-current"
          {...designSlot('Button', 'trailingIcon')}
        >
          <Icon name={trailingIcon} size={size} />
        </span>
      ) : null}
    </button>
  );
});
