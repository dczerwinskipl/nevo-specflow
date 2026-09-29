import { type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
type ControlledProps = {
    value: string;
    defaultValue?: never;
    onValueChange: (value: string) => void;
};
type UncontrolledProps = {
    value?: never;
    defaultValue: string;
    onValueChange?: (value: string) => void;
};
export type SegmentedControlProps = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> & (ControlledProps | UncontrolledProps);
export interface SegmentedControlItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
    value: string;
}
export declare const SegmentedControlItem: import("react").ForwardRefExoticComponent<SegmentedControlItemProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const SegmentedControl: import("react").ForwardRefExoticComponent<SegmentedControlProps & import("react").RefAttributes<HTMLDivElement>> & {
    Item: import("react").ForwardRefExoticComponent<SegmentedControlItemProps & import("react").RefAttributes<HTMLButtonElement>>;
};
export {};
//# sourceMappingURL=SegmentedControl.d.ts.map