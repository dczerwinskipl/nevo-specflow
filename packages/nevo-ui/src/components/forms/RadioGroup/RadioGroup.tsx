import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useRef,
  type MutableRefObject,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { cn } from '../../../lib';
import { hitAreaBlockClassName, hitAreaClassName } from '../../../design-system/interactionRecipes';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';

const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * Arrow navigation of the group in progress. Radix selects a radio that receives focus only while
 * the arrow key is still held, and moves focus a task later: a short press (key up before the
 * focus arrives) moved focus without selecting. The group remembers the arrow until that focus.
 */
const ArrowNavigation = createContext<MutableRefObject<boolean> | null>(null);

export const RadioGroup = forwardRef<
  ComponentRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup(
  { className, onKeyDownCapture, onPointerDownCapture, onBlurCapture, ...props },
  ref,
) {
  const capture = useDesignMetadata('RadioGroup');
  const arrow = useRef(false);
  const { children, ...rootProps } = props;
  return (
    <ArrowNavigation.Provider value={arrow}>
      <RadioGroupPrimitive.Root
        ref={ref}
        className={cn('min-w-0', className)}
        onKeyDownCapture={(event) => {
          if (ARROW_KEYS.includes(event.key)) {
            arrow.current = true;
            // No focus move follows (one option, the end without loop): forget the arrow, so a
            // later Tab onto an unchecked option never selects it.
            const from = event.target;
            setTimeout(() => {
              if (globalThis.document.activeElement === from) arrow.current = false;
            }, 100);
          }
          onKeyDownCapture?.(event);
        }}
        onPointerDownCapture={(event) => {
          arrow.current = false;
          onPointerDownCapture?.(event);
        }}
        onBlurCapture={(event) => {
          // Focus leaving the group ends any arrow navigation.
          if (!event.currentTarget.contains(event.relatedTarget)) arrow.current = false;
          onBlurCapture?.(event);
        }}
        {...rootProps}
        {...capture}
      >
        <div className="grid gap-2" {...designSlot('RadioGroup', 'options')}>
          {children}
        </div>
      </RadioGroupPrimitive.Root>
    </ArrowNavigation.Provider>
  );
});

export interface RadioGroupItemProps extends ComponentPropsWithoutRef<
  typeof RadioGroupPrimitive.Item
> {}

export const RadioGroupItem = forwardRef<
  ComponentRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(function RadioGroupItem({ className, onFocus, ...props }, ref) {
  const arrow = useContext(ArrowNavigation);
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      onFocus={(event) => {
        onFocus?.(event);
        // Focus moved by an arrow key selects the radio, however short the key press was.
        if (arrow?.current) {
          arrow.current = false;
          if (event.currentTarget.getAttribute('data-state') !== 'checked')
            event.currentTarget.click();
        }
      }}
      className={cn(
        hitAreaClassName,
        'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-control bg-surface-control outline-none',
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
  className,
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
    <div className={cn('flex items-start gap-2.5', optionClassName)}>
      <RadioGroupItem
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
            hitAreaBlockClassName,
            'block text-body-sm',
            disabled
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
    </div>
  );
}
