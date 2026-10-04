import * as SelectPrimitive from '@radix-ui/react-select';
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  floatingContentClassName,
  floatingItemVariants,
  floatingLabelClassName,
  floatingSeparatorClassName,
} from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { useFieldControl } from '../Field';
import { isAriaInvalid } from '../shared/textControlState';

interface SelectContextValue {
  disabled: boolean;
  invalid: boolean;
}
const SelectContext = createContext<SelectContextValue>({ disabled: false, invalid: false });

export type SelectProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Root> & {
  invalid?: boolean;
};

export function Select({ disabled = false, invalid = false, ...props }: SelectProps) {
  const field = useFieldControl({
    ariaInvalid: invalid ? true : undefined,
    disabled,
  });
  const resolvedInvalid = isAriaInvalid(field.ariaInvalid);
  return (
    <SelectContext.Provider value={{ disabled: field.disabled, invalid: resolvedInvalid }}>
      <SelectPrimitive.Root disabled={field.disabled} {...props} />
    </SelectContext.Provider>
  );
}

export const SelectGroup = SelectPrimitive.Group;

export const selectTriggerDefaults = { state: 'default' } as const;

export const selectTriggerVariants = tv({
  base: 'select-trigger inline-flex h-control-height-default w-full min-w-0 cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-control border border-solid bg-surface-control px-control-padding-default text-left text-body-md text-content-primary transition-colors data-[placeholder]:text-content-placeholder disabled:cursor-not-allowed [&>[data-design-slot=value]]:min-w-0 [&>[data-design-slot=value]]:flex-1 [&>[data-design-slot=value]]:overflow-hidden [&>[data-design-slot=value]]:text-ellipsis [&>[data-design-slot=value]]:whitespace-nowrap [&>[data-design-slot=value]>*]:block [&>[data-design-slot=value]>*]:overflow-hidden [&>[data-design-slot=value]>*]:text-ellipsis [&>[data-design-slot=value]>*]:whitespace-nowrap',
  variants: {
    state: {
      default: 'border-border-default',
      focus: 'border-focus-ring',
      disabled: 'border-border-subtle bg-surface-subtle text-content-muted opacity-60',
      invalid: 'border-border-error',
    },
  },
  defaultVariants: selectTriggerDefaults,
});

export type SelectTriggerProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>;

export const SelectTrigger = forwardRef<
  ComponentRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(function SelectTrigger(
  {
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    autoFocus,
    children,
    className,
    disabled: disabledProp,
    id,
    ...props
  },
  ref,
) {
  const root = useContext(SelectContext);
  const field = useFieldControl({
    ariaDescribedBy,
    ariaInvalid: root.invalid ? true : ariaInvalid,
    disabled: disabledProp === true || root.disabled,
    id,
  });
  const invalid = isAriaInvalid(field.ariaInvalid);
  const state = field.disabled ? 'disabled' : invalid ? 'invalid' : autoFocus ? 'focus' : 'default';
  const capture = useDesignMetadata('Select', { state });

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      aria-describedby={field.ariaDescribedBy}
      aria-invalid={field.ariaInvalid}
      autoFocus={autoFocus}
      className={cn(selectTriggerVariants({ state }), className)}
      disabled={field.disabled}
      id={field.id}
      {...props}
      {...(field.insideField ? designSlot('Field', 'control') : {})}
      {...capture}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <span
          className="inline-flex shrink-0 text-content-muted"
          {...designSlot('Select', 'trailingIcon')}
        >
          <Icon name="chevron-down" size="sm" />
        </span>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export type SelectValueProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Value>;

export const SelectValue = forwardRef<ComponentRef<typeof SelectPrimitive.Value>, SelectValueProps>(
  function SelectValue({ className, ...props }, ref) {
    return (
      <SelectPrimitive.Value
        ref={ref}
        className={cn('min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap', className)}
        {...props}
        {...designSlot('Select', 'value')}
      />
    );
  },
);

export type SelectContentProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  container?: HTMLElement | null;
};

export const SelectContent = forwardRef<
  ComponentRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(function SelectContent(
  {
    align = 'start',
    children,
    className,
    container,
    position = 'popper',
    sideOffset = 8,
    ...props
  },
  ref,
) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        ref={ref}
        align={align}
        className={cn(
          'select-content w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]',
          floatingContentClassName,
          className,
        )}
        position={position}
        sideOffset={sideOffset}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-72 p-0">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export type SelectItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item>;

export const SelectItem = forwardRef<ComponentRef<typeof SelectPrimitive.Item>, SelectItemProps>(
  function SelectItem({ autoFocus, children, className, disabled, ...props }, ref) {
    const capture = useDesignMetadata('SelectItem', {
      state: disabled ? 'disabled' : autoFocus ? 'highlighted' : 'default',
    });
    return (
      <SelectPrimitive.Item
        ref={ref}
        autoFocus={autoFocus}
        className={cn('pr-8', floatingItemVariants(), className)}
        data-design-token-background={autoFocus ? 'Color/surface-hover' : undefined}
        disabled={disabled}
        {...props}
        {...capture}
      >
        <SelectPrimitive.ItemText asChild>
          <Typography
            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-current"
            {...designSlot('SelectItem', 'label')}
            variant="body-sm"
          >
            {children}
          </Typography>
        </SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator asChild>
          <span
            className="absolute right-control-padding-compact inline-flex text-content-primary"
            {...designSlot('SelectItem', 'indicator')}
          >
            <Icon name="check" size="sm" />
          </span>
        </SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>
    );
  },
);

export const SelectLabel = forwardRef<
  ComponentRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ children, className, ...props }, ref) {
  return (
    <SelectPrimitive.Label ref={ref} className={cn(floatingLabelClassName, className)} {...props}>
      <Typography as="span" className="text-inherit" variant="section-label">
        {children}
      </Typography>
    </SelectPrimitive.Label>
  );
});

export const SelectSeparator = forwardRef<
  ComponentRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn(floatingSeparatorClassName, className)}
      {...props}
    />
  );
});
