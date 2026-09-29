import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';

export const RadioGroup = forwardRef<
  ComponentRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  const capture = useDesignMetadata('RadioGroup');
  const { children, ...rootProps } = props;
  return (
    <RadioGroupPrimitive.Root
      ref={ref}
      className={cn('min-w-0', className)}
      {...rootProps}
      {...capture}
    >
      <div className="grid gap-2" {...designSlot('RadioGroup', 'options')}>
        {children}
      </div>
    </RadioGroupPrimitive.Root>
  );
});

export interface RadioGroupItemProps extends ComponentPropsWithoutRef<
  typeof RadioGroupPrimitive.Item
> {}

export const RadioGroupItem = forwardRef<
  ComponentRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-default bg-surface-control outline-none',
        'data-[state=checked]:border-action-primary disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-action-primary" />
    </RadioGroupPrimitive.Item>
  );
});

export interface RadioGroupOptionProps extends RadioGroupItemProps {
  label: ReactNode;
  description?: ReactNode;
  optionClassName?: string;
}

export function RadioGroupOption({
  'aria-describedby': ariaDescribedBy,
  description,
  disabled,
  id: idProp,
  label,
  optionClassName,
  ...props
}: RadioGroupOptionProps) {
  const generatedId = useId();
  const id = idProp ?? `radio-${generatedId}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex items-start gap-2.5', disabled && 'opacity-60', optionClassName)}>
      <RadioGroupItem
        {...props}
        aria-describedby={describedBy}
        disabled={disabled}
        id={id}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn(
            'block text-body-sm text-content-primary',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          {label}
        </label>
        {description ? (
          <div id={descriptionId} className="mt-0.5 text-body-sm text-content-muted">
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}
