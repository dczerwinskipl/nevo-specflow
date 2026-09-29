import { type HTMLAttributes, type ReactElement } from 'react';
import '../shared/textControl.css';
interface InputGroupContextValue {
    disabled: boolean;
    insideGroup: true;
}
export interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
    disabled?: boolean;
}
export declare const InputGroupAddon: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLSpanElement> & import("react").RefAttributes<HTMLSpanElement>>;
export interface InputGroupActionProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
    children: ReactElement<{
        className?: string;
        'data-focus-ring'?: 'delegated';
        disabled?: boolean;
    }>;
}
export declare const InputGroupAction: import("react").ForwardRefExoticComponent<InputGroupActionProps & import("react").RefAttributes<HTMLSpanElement>>;
export declare function useInputGroupControl(): InputGroupContextValue | null;
export declare const InputGroup: import("react").ForwardRefExoticComponent<InputGroupProps & import("react").RefAttributes<HTMLDivElement>> & {
    Addon: import("react").ForwardRefExoticComponent<HTMLAttributes<HTMLSpanElement> & import("react").RefAttributes<HTMLSpanElement>>;
    Action: import("react").ForwardRefExoticComponent<InputGroupActionProps & import("react").RefAttributes<HTMLSpanElement>>;
};
export {};
//# sourceMappingURL=InputGroup.d.ts.map