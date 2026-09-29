import * as SwitchPrimitive from '@radix-ui/react-switch';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';
export declare const Switch: import("react").ForwardRefExoticComponent<Omit<SwitchPrimitive.SwitchProps & import("react").RefAttributes<HTMLButtonElement>, "ref"> & import("react").RefAttributes<HTMLButtonElement>>;
export interface SwitchFieldProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
    label: ReactNode;
    description?: ReactNode;
    fieldClassName?: string;
}
export declare function SwitchField({ 'aria-describedby': ariaDescribedBy, description, disabled, fieldClassName, id: idProp, label, ...props }: SwitchFieldProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Switch.d.ts.map