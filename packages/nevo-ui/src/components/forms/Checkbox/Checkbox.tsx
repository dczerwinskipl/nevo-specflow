import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { Icon } from '../../foundations/Icon';
import { useFieldControl } from '../Field';

export type CheckboxCheckedState = boolean | 'indeterminate';

export interface CheckboxProps extends Omit<
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  'checked'
> {
  checked?: boolean;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<ComponentRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  function Checkbox(
    {
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      checked,
      className,
      defaultChecked,
      disabled,
      id,
      indeterminate = false,
      ...props
    },
    ref,
  ) {
    const field = useFieldControl({ ariaDescribedBy, ariaInvalid, disabled, id });
    const state: CheckboxCheckedState | undefined = indeterminate ? 'indeterminate' : checked;
    const designState = disabled
      ? 'disabled'
      : indeterminate
        ? 'indeterminate'
        : (checked ?? defaultChecked) === true
          ? 'checked'
          : 'default';
    const capture = useDesignMetadata('Checkbox', { state: designState });

    return (
      <CheckboxPrimitive.Root
        ref={ref}
        aria-describedby={field.ariaDescribedBy}
        aria-invalid={field.ariaInvalid}
        checked={state}
        defaultChecked={defaultChecked}
        className={cn(
          'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-control-inline border border-border-default bg-surface-control text-content-on-primary outline-none',
          'data-[state=checked]:border-action-primary data-[state=checked]:bg-action-primary data-[state=indeterminate]:border-action-primary data-[state=indeterminate]:bg-action-primary',
          'disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-subtle disabled:opacity-60',
          className,
        )}
        disabled={field.disabled}
        id={field.id}
        {...props}
        {...capture}
      >
        <CheckboxPrimitive.Indicator
          className="inline-flex items-center justify-center"
          {...designSlot('Checkbox', 'indicator')}
        >
          {state === 'indeterminate' ? (
            <span aria-hidden className="block h-0.5 w-2 rounded-full bg-current" />
          ) : (
            <Icon name="check" size="sm" className="size-3" />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  },
);

export interface CheckboxFieldProps extends CheckboxProps {
  label: ReactNode;
  description?: ReactNode;
  fieldClassName?: string;
}

export function CheckboxField({
  'aria-describedby': ariaDescribedBy,
  className,
  description,
  disabled,
  fieldClassName,
  id: idProp,
  label,
  ...props
}: CheckboxFieldProps) {
  const generatedId = useId();
  const id = idProp ?? `checkbox-${generatedId}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex items-start gap-2.5', disabled && 'opacity-60', fieldClassName)}>
      <Checkbox
        {...props}
        aria-describedby={describedBy}
        disabled={disabled}
        id={id}
        className={cn('mt-0.5', className)}
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
