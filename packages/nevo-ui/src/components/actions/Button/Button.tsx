import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  actionVariantClasses,
  fastColorTransitionClassName,
} from '../../../design-system/interactionRecipes';
import { cn } from '../../../lib';
import { Icon, type IconGlyph } from '../../foundations/Icon';
import { Typography, type TypographyVariant } from '../../foundations/Typography';

export const buttonDefaults = { variant: 'primary', size: 'md', width: 'content' } as const;

export const buttonVariants = tv({
  base: `inline-flex cursor-pointer items-center justify-center border border-solid disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${fastColorTransitionClassName}`,
  variants: {
    variant: {
      ...actionVariantClasses,
    },
    size: {
      // One line equals the control height exactly: min height minus border and label line, split evenly.
      sm: 'min-h-control-height-compact gap-1.5 rounded-control px-control-padding-compact py-[calc((var(--spacing-control-height-compact)_-_2px_-_var(--text-label-sm--line-height))/2)]',
      md: 'min-h-control-height-default gap-2 rounded-control px-control-padding-default py-[calc((var(--spacing-control-height-default)_-_2px_-_var(--text-label-md--line-height))/2)]',
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

/**
 * How a label that is longer than the available width behaves.
 * - `wrap` (default): the label wraps and the button grows taller; one line keeps the control height.
 * - `truncate`: one line with an ellipsis. Only where the full text is available elsewhere.
 * - `nowrap`: one line that never shrinks; the caller guarantees the width.
 */
export type ButtonLabelOverflow = 'wrap' | 'truncate' | 'nowrap';

export const buttonLabelOverflowClasses = {
  wrap: { button: 'max-w-full', label: 'min-w-0 text-center break-words' },
  truncate: { button: 'min-w-0 max-w-full whitespace-nowrap', label: 'min-w-0 truncate' },
  nowrap: { button: 'whitespace-nowrap', label: '' },
} as const satisfies Record<ButtonLabelOverflow, { button: string; label: string }>;

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  leadingIcon?: IconGlyph;
  labelOverflow?: ButtonLabelOverflow;
  trailingIcon?: IconGlyph;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    labelOverflow = 'wrap',
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
      className={cn(
        buttonVariants({ variant, size, width }),
        buttonLabelOverflowClasses[labelOverflow].button,
        className,
      )}
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
        className={cn('block text-current', buttonLabelOverflowClasses[labelOverflow].label)}
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
