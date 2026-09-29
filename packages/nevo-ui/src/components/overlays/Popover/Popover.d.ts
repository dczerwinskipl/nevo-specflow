import * as PopoverPrimitive from '@radix-ui/react-popover';
import { type ComponentPropsWithoutRef } from 'react';
import './Popover.css';
export declare const Popover: import("react").FC<PopoverPrimitive.PopoverProps>;
export declare const PopoverTrigger: import("react").ForwardRefExoticComponent<PopoverPrimitive.PopoverTriggerProps & import("react").RefAttributes<HTMLButtonElement>>;
export declare const PopoverAnchor: import("react").ForwardRefExoticComponent<PopoverPrimitive.PopoverAnchorProps & import("react").RefAttributes<HTMLDivElement>>;
export declare const PopoverClose: import("react").ForwardRefExoticComponent<PopoverPrimitive.PopoverCloseProps & import("react").RefAttributes<HTMLButtonElement>>;
export type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    container?: HTMLElement | null;
};
export declare const PopoverContent: import("react").ForwardRefExoticComponent<Omit<PopoverPrimitive.PopoverContentProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & {
    container?: HTMLElement | null;
} & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=Popover.d.ts.map