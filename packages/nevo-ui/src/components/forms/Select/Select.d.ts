import * as SelectPrimitive from '@radix-ui/react-select';
import { type ComponentPropsWithoutRef } from 'react';
import './Select.css';
export type SelectProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Root> & {
    invalid?: boolean;
};
export declare function Select({ disabled, invalid, ...props }: SelectProps): import("react/jsx-runtime").JSX.Element;
export declare const SelectGroup: import("react").ForwardRefExoticComponent<SelectPrimitive.SelectGroupProps & import("react").RefAttributes<HTMLDivElement>>;
export declare const selectTriggerDefaults: {
    readonly state: "default";
};
export declare const selectTriggerVariants: import("tailwind-variants/lite").TVReturnType<{
    state: {
        default: "border-border-default";
        focus: "border-focus-ring";
        disabled: "border-border-subtle bg-surface-subtle text-content-muted opacity-60";
        invalid: "border-border-error";
    };
}, undefined, "select-trigger inline-flex h-control-height-default w-full min-w-0 cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-control border border-solid bg-surface-control px-control-padding-default text-left text-body-md text-content-primary transition-colors data-[placeholder]:text-content-placeholder disabled:cursor-not-allowed [&>[data-design-slot=value]]:min-w-0 [&>[data-design-slot=value]]:flex-1 [&>[data-design-slot=value]]:overflow-hidden [&>[data-design-slot=value]]:text-ellipsis [&>[data-design-slot=value]]:whitespace-nowrap [&>[data-design-slot=value]>*]:block [&>[data-design-slot=value]>*]:overflow-hidden [&>[data-design-slot=value]>*]:text-ellipsis [&>[data-design-slot=value]>*]:whitespace-nowrap", {
    state: {
        default: "border-border-default";
        focus: "border-focus-ring";
        disabled: "border-border-subtle bg-surface-subtle text-content-muted opacity-60";
        invalid: "border-border-error";
    };
}, undefined, import("tailwind-variants/lite").TVReturnTypeLike<{
    state: {
        default: "border-border-default";
        focus: "border-focus-ring";
        disabled: "border-border-subtle bg-surface-subtle text-content-muted opacity-60";
        invalid: "border-border-error";
    };
}, undefined>>;
export type SelectTriggerProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>;
export declare const SelectTrigger: import("react").ForwardRefExoticComponent<Omit<SelectPrimitive.SelectTriggerProps & import("react").RefAttributes<HTMLButtonElement>, "ref"> & import("react").RefAttributes<HTMLButtonElement>>;
export type SelectValueProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Value>;
export declare const SelectValue: import("react").ForwardRefExoticComponent<Omit<SelectPrimitive.SelectValueProps & import("react").RefAttributes<HTMLSpanElement>, "ref"> & import("react").RefAttributes<HTMLSpanElement>>;
export type SelectContentProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    container?: HTMLElement | null;
};
export declare const SelectContent: import("react").ForwardRefExoticComponent<Omit<SelectPrimitive.SelectContentProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & {
    container?: HTMLElement | null;
} & import("react").RefAttributes<HTMLDivElement>>;
export type SelectItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item>;
export declare const SelectItem: import("react").ForwardRefExoticComponent<Omit<SelectPrimitive.SelectItemProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & import("react").RefAttributes<HTMLDivElement>>;
export declare const SelectLabel: import("react").ForwardRefExoticComponent<Omit<SelectPrimitive.SelectLabelProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & import("react").RefAttributes<HTMLDivElement>>;
export declare const SelectSeparator: import("react").ForwardRefExoticComponent<Omit<SelectPrimitive.SelectSeparatorProps & import("react").RefAttributes<HTMLDivElement>, "ref"> & import("react").RefAttributes<HTMLDivElement>>;
//# sourceMappingURL=Select.d.ts.map