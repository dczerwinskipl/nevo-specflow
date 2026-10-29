import * as SelectPrimitive from '@radix-ui/react-select';
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ReactNode,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  floatingContentClassName,
  floatingLabelClassName,
  floatingSeparatorClassName,
} from '../../../design-system/floatingRecipes';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { useFieldControl } from '../Field';
import {
  optionDescriptionClassName,
  optionItemClassName,
  optionLabelClassName,
  optionMetaClassName,
} from '../shared/optionRecipes';
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

export type SelectItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
  /** Secondary line under the label. Wraps, stays readable when the item is disabled/unavailable. */
  description?: ReactNode;
  /** Trailing right-aligned slot (text or Badge). Never shown in the trigger value. */
  meta?: ReactNode;
  /**
   * Keeps the item reachable (focus, arrow keys, screen readers) but blocks selection.
   * Radix removes natively `disabled` items from keyboard navigation, so use this together
   * with `description` when the user must be able to reach and read the reason.
   */
  unavailable?: boolean;
};

const selectItemLabelClassName = optionLabelClassName;

/** Root class contract for an item; shared with `Combobox` through `optionRecipes`. */
export const selectItemClassName = optionItemClassName;

export const SelectItem = forwardRef<ComponentRef<typeof SelectPrimitive.Item>, SelectItemProps>(
  function SelectItem(
    {
      autoFocus,
      children,
      className,
      description,
      disabled,
      meta,
      onClick,
      onKeyDown,
      onPointerUp,
      unavailable = false,
      ...props
    },
    ref,
  ) {
    const baseId = useId();
    const descriptionId = `${baseId}-description`;
    const metaId = `${baseId}-meta`;
    const hasDescription =
      description !== undefined && description !== null && description !== false;
    const hasMeta = meta !== undefined && meta !== null && meta !== false;
    const structured = hasDescription || hasMeta;
    const blocked = disabled === true || unavailable;
    const keepsReasonReadable = structured && blocked;
    const capture = useDesignMetadata('SelectItem', {
      state: blocked ? 'disabled' : autoFocus ? 'highlighted' : 'default',
    });
    const describedBy =
      [hasDescription ? descriptionId : null, hasMeta ? metaId : null].filter(Boolean).join(' ') ||
      undefined;
    const block = (event: { preventDefault: () => void }) => event.preventDefault();

    const label = (
      <SelectPrimitive.ItemText asChild>
        <Typography
          className={cn(selectItemLabelClassName, !structured && 'flex-1')}
          {...designSlot('SelectItem', 'label')}
          variant="body-sm"
        >
          {children}
        </Typography>
      </SelectPrimitive.ItemText>
    );

    return (
      <SelectPrimitive.Item
        ref={ref}
        aria-describedby={describedBy}
        {...(unavailable ? { 'aria-disabled': true } : {})}
        autoFocus={autoFocus}
        className={cn(selectItemClassName({ keepsReasonReadable, unavailable }), className)}
        data-design-token-background={autoFocus ? 'Color/surface-hover' : undefined}
        data-unavailable={unavailable ? '' : undefined}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          if (unavailable) {
            block(event);
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (unavailable && (event.key === 'Enter' || event.key === ' ')) {
            block(event);
          }
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          if (unavailable) {
            block(event);
          }
        }}
        {...props}
        {...capture}
      >
        {structured ? (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('flex min-w-0', keepsReasonReadable && 'opacity-50')}>
                {label}
              </span>
              {hasDescription ? (
                <Typography
                  className={optionDescriptionClassName}
                  id={descriptionId}
                  data-select-item-part="description"
                  variant="body-sm"
                >
                  {description}
                </Typography>
              ) : null}
            </span>
            {hasMeta ? (
              <span
                className={cn(optionMetaClassName, keepsReasonReadable && 'opacity-50')}
                id={metaId}
                data-select-item-part="meta"
              >
                {meta}
              </span>
            ) : null}
          </>
        ) : (
          label
        )}
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
