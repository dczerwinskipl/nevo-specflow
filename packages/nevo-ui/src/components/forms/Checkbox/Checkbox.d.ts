import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';
export type CheckboxCheckedState = boolean | 'indeterminate';
export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'checked'> {
    checked?: boolean;
    indeterminate?: boolean;
}
export declare const Checkbox: import("react").ForwardRefExoticComponent<CheckboxProps & import("react").RefAttributes<HTMLButtonElement>>;
export interface CheckboxFieldProps extends CheckboxProps {
    label: ReactNode;
    description?: ReactNode;
    fieldClassName?: string;
}
export declare function CheckboxField({ 'aria-describedby': ariaDescribedBy, description, disabled, fieldClassName, id: idProp, label, ...props }: CheckboxFieldProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Checkbox.d.ts.map