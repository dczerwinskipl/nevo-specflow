import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';
export declare const RadioGroup: import("react").ForwardRefExoticComponent<Omit<RadioGroupPrimitive.RadioGroupProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & import("react").RefAttributes<HTMLDivElement>>;
export interface RadioGroupItemProps extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
}
export declare const RadioGroupItem: import("react").ForwardRefExoticComponent<RadioGroupItemProps & import("react").RefAttributes<HTMLButtonElement>>;
export interface RadioGroupOptionProps extends RadioGroupItemProps {
    label: ReactNode;
    description?: ReactNode;
    optionClassName?: string;
}
export declare function RadioGroupOption({ 'aria-describedby': ariaDescribedBy, description, disabled, id: idProp, label, optionClassName, ...props }: RadioGroupOptionProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=RadioGroup.d.ts.map