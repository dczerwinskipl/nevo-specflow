import {
  Children,
  Fragment,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useId,
  type AriaAttributes,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
} from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { typographyTextStyleRef } from '../../../design-system/resources';
import { cn } from '../../../lib';
import { isAriaInvalid } from '../shared/textControlState';

interface FieldContextValue {
  controlId: string;
  descriptionId: string;
  disabled: boolean;
  errorId: string;
  hasDescription: boolean;
  hasError: boolean;
  hasLabel: boolean;
  invalid: boolean;
  labelId: string;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function containsFieldPart(children: ReactNode, part: unknown): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement(child)) return false;
    if (child.type === part) return true;
    if (child.type === FieldRoot) return false;
    const nestedChildren = (child.props as { children?: ReactNode }).children;
    return child.type === Fragment || nestedChildren !== undefined
      ? containsFieldPart(nestedChildren, part)
      : false;
  });
}

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  controlId?: string;
  disabled?: boolean;
  invalid?: boolean;
}

const FieldRoot = forwardRef<HTMLDivElement, FieldProps>(function FieldRoot(
  { children, className, controlId: controlIdProp, disabled = false, invalid = false, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = controlIdProp ?? `field-${generatedId}`;
  const context: FieldContextValue = {
    controlId,
    descriptionId: `${controlId}-description`,
    disabled,
    errorId: `${controlId}-error`,
    hasDescription: containsFieldPart(children, FieldDescription),
    hasError: containsFieldPart(children, FieldError),
    hasLabel: containsFieldPart(children, FieldLabel),
    invalid,
    labelId: `${controlId}-label`,
  };
  const capture = useDesignMetadata('Field', {
    state: disabled ? 'disabled' : invalid ? 'invalid' : 'default',
  });

  return (
    <FieldContext.Provider value={context}>
      <div
        ref={ref}
        className={cn('field grid gap-1.5', className)}
        data-disabled={disabled ? 'true' : undefined}
        data-invalid={invalid ? 'true' : undefined}
        {...props}
        {...capture}
      >
        {children}
      </div>
    </FieldContext.Provider>
  );
});

export const FieldLabel = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function FieldLabel({ className, htmlFor, id, ...props }, ref) {
    const field = useContext(FieldContext);
    const capture = useDesignMetadata(
      'Typography',
      {},
      {
        textFlow: true,
        textStyleRef: typographyTextStyleRef('label-sm'),
      },
    );
    return (
      <label
        ref={ref}
        className={cn(
          'field-label font-sans text-label-sm',
          field?.disabled ? 'text-content-muted' : 'text-content-secondary',
          className,
        )}
        htmlFor={field?.controlId ?? htmlFor}
        id={field?.labelId ?? id}
        {...props}
        {...designSlot('Field', 'label')}
        {...capture}
      />
    );
  },
);

export const FieldDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function FieldDescription({ className, id, ...props }, ref) {
  const field = useContext(FieldContext);
  const capture = useDesignMetadata(
    'Typography',
    {},
    {
      textFlow: true,
      textStyleRef: typographyTextStyleRef('body-sm'),
    },
  );
  return (
    <p
      ref={ref}
      className={cn('field-description m-0 font-sans text-body-sm text-content-muted', className)}
      id={field?.descriptionId ?? id}
      {...props}
      {...designSlot('Field', 'description')}
      {...capture}
    />
  );
});

export const FieldError = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function FieldError({ className, id, ...props }, ref) {
    const field = useContext(FieldContext);
    const capture = useDesignMetadata(
      'Typography',
      {},
      {
        textFlow: true,
        textStyleRef: typographyTextStyleRef('body-sm'),
      },
    );
    return (
      <p
        ref={ref}
        className={cn('field-error m-0 font-sans text-body-sm text-content-error', className)}
        id={field?.errorId ?? id}
        {...props}
        {...designSlot('Field', 'error')}
        {...capture}
      />
    );
  },
);

function mergeIds(...values: Array<string | undefined>) {
  const ids = [...new Set(values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []))];
  return ids.length ? ids.join(' ') : undefined;
}

export function useFieldControl({
  ariaDescribedBy,
  ariaInvalid,
  ariaLabelledBy,
  disabled,
  id,
}: {
  ariaDescribedBy?: string;
  ariaInvalid?: AriaAttributes['aria-invalid'];
  ariaLabelledBy?: string;
  disabled?: boolean;
  id?: string;
}) {
  const field = useContext(FieldContext);
  const invalid = Boolean(field?.invalid) || isAriaInvalid(ariaInvalid);
  return {
    ariaDescribedBy: mergeIds(
      ariaDescribedBy,
      field?.hasDescription ? field.descriptionId : undefined,
      invalid && field?.hasError ? field.errorId : undefined,
    ),
    ariaInvalid: field?.invalid ? true : ariaInvalid,
    ariaLabelledBy: mergeIds(ariaLabelledBy, field?.hasLabel ? field.labelId : undefined),
    disabled: Boolean(disabled || field?.disabled),
    id: field?.controlId ?? id,
    insideField: Boolean(field),
  };
}

export const Field = Object.assign(FieldRoot, {
  Label: FieldLabel,
  Description: FieldDescription,
  Error: FieldError,
});



