import type { ReactNode } from 'react';
import { type GroupProps } from 'react-aria-components';
type DesignSlotAttributes = Readonly<{
    'data-design-slot': string;
}>;
export interface DateControlProps extends Omit<GroupProps, 'children' | 'className'> {
    children: ReactNode;
    className?: string;
    controlSlot?: DesignSlotAttributes;
    triggerSlot?: DesignSlotAttributes;
}
export declare function DateControl({ children, className, controlSlot, triggerSlot, ...props }: DateControlProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DateControl.d.ts.map