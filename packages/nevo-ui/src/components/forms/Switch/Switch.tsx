import * as SwitchPrimitive from '@radix-ui/react-switch';
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { hitAreaBlockClassName, hitAreaClassName } from '../../../design-system/interactionRecipes';
import { useFieldControl } from '../Field';

export const Switch = forwardRef<
  ComponentRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch(
  {
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    className,
    checked,
    defaultChecked,
    disabled,
    id,
    ...props
  },
  ref,
) {
  const field = useFieldControl({ ariaDescribedBy, ariaInvalid, disabled, id });
  const capture = useDesignMetadata('Switch', {
    state: disabled ? 'disabled' : (checked ?? defaultChecked) ? 'checked' : 'default',
  });
  return (
    <SwitchPrimitive.Root
      ref={ref}
      aria-describedby={field.ariaDescribedBy}
      aria-invalid={field.ariaInvalid}
      className={cn(
        hitAreaClassName,
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-control bg-surface-control p-0.5 outline-none transition-colors',
        'data-[state=checked]:border-action-primary data-[state=checked]:bg-action-primary disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
        className,
      )}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={field.disabled}
      id={field.id}
      {...props}
      {...capture}
    >
      <SwitchPrimitive.Thumb
        className="block size-3.5 rounded-full bg-content-primary shadow transition-transform data-[state=checked]:translate-x-4"
        {...designSlot('Switch', 'thumb')}
      />
    </SwitchPrimitive.Root>
  );
});

export interface SwitchFieldProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label: ReactNode;
  description?: ReactNode;
  fieldClassName?: string;
}

export function SwitchField({
  'aria-describedby': ariaDescribedBy,
  className,
  description,
  disabled,
  fieldClassName,
  id: idProp,
  label,
  ...props
}: SwitchFieldProps) {
  const generatedId = useId();
  const id = idProp ?? `switch-${generatedId}`;
  const descriptionId = description ? `${id}-description` : undefined;
  // `aria-disabled` keeps the control reachable (its reason is the description); it reads as muted too.
  const unavailable =
    Boolean(disabled) || props['aria-disabled'] === true || props['aria-disabled'] === 'true';
  const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex items-start justify-between gap-4', fieldClassName)}>
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className={cn(
            hitAreaBlockClassName,
            'block text-body-sm',
            unavailable
              ? 'cursor-not-allowed text-content-muted'
              : 'cursor-pointer text-content-primary',
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
      <Switch
        {...props}
        aria-describedby={describedBy}
        disabled={disabled}
        id={id}
        className={cn('mt-0.5', className)}
      />
    </div>
  );
}
