import {
  cloneElement,
  createContext,
  forwardRef,
  useContext,
  type HTMLAttributes,
  type ReactElement,
} from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';
import { useFieldControl } from '../Field';

interface InputGroupContextValue {
  disabled: boolean;
  insideGroup: true;
}

const InputGroupContext = createContext<InputGroupContextValue | null>(null);

const inputGroupVariants = tv({
  base: 'input-group flex h-control-height-default w-full items-center gap-2 rounded-control border border-solid px-control-padding-inline transition-colors',
  variants: {
    state: {
      default: 'border-border-default bg-surface-control text-content-primary',
      disabled: 'border-border-subtle bg-surface-subtle text-content-muted opacity-60',
    },
  },
  defaultVariants: {
    state: 'default',
  },
});

export interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
}

const InputGroupRoot = forwardRef<HTMLDivElement, InputGroupProps>(function InputGroupRoot(
  { className, disabled = false, ...props },
  ref,
) {
  const field = useFieldControl({ disabled });
  const capture = useDesignMetadata('InputGroup');
  return (
    <InputGroupContext.Provider value={{ disabled: field.disabled, insideGroup: true }}>
      <div
        ref={ref}
        className={cn(
          inputGroupVariants({ state: field.disabled ? 'disabled' : 'default' }),
          className,
        )}
        data-disabled={field.disabled ? 'true' : undefined}
        {...props}
        {...(field.insideField ? designSlot('Field', 'control') : {})}
        {...capture}
      />
    </InputGroupContext.Provider>
  );
});

export const InputGroupAddon = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function InputGroupAddon({ className, ...props }, ref) {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex shrink-0 items-center justify-center text-content-muted',
          className,
        )}
        {...props}
        {...designSlot('InputGroup', 'addon')}
      />
    );
  },
);

export interface InputGroupActionProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: ReactElement<{
    className?: string;
    'data-focus-ring'?: 'delegated';
    disabled?: boolean;
  }>;
}

export const InputGroupAction = forwardRef<HTMLSpanElement, InputGroupActionProps>(
  function InputGroupAction({ children, className, ...props }, ref) {
    const group = useContext(InputGroupContext);
    const action = cloneElement(children, {
      className: cn(
        children.props.className,
        'focus-visible:bg-surface-selected focus-visible:text-content-primary focus-visible:outline-none',
      ),
      'data-focus-ring': 'delegated',
      disabled: group?.disabled ? true : children.props.disabled,
    });
    return (
      <span
        ref={ref}
        className={cn('inline-flex shrink-0 items-center justify-center', className)}
        {...props}
        {...designSlot('InputGroup', 'action')}
      >
        {action}
      </span>
    );
  },
);

export function useInputGroupControl() {
  return useContext(InputGroupContext);
}

export const InputGroup = Object.assign(InputGroupRoot, {
  Addon: InputGroupAddon,
  Action: InputGroupAction,
});
