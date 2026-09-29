import { jsx as _jsx } from "react/jsx-runtime";
import { cloneElement, createContext, forwardRef, useContext, } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { useFieldControl } from '../Field';
import '../shared/textControl.css';
const InputGroupContext = createContext(null);
const inputGroupVariants = tv({
    base: 'input-group flex h-control-height-default w-full items-center gap-2 rounded-control border border-solid px-control-padding-inline transition-colors',
    variants: {
        state: {
            default: 'border-border-default bg-surface-control text-content-primary',
            disabled: 'border-border-subtle bg-surface-subtle text-content-muted opacity-60',
        },
    },
    defaultVariants: {
        state: 'default',
    },
});
const InputGroupRoot = forwardRef(function InputGroupRoot({ className, disabled = false, ...props }, ref) {
    const field = useFieldControl({ disabled });
    const capture = useDesignMetadata('InputGroup');
    return (_jsx(InputGroupContext.Provider, { value: { disabled: field.disabled, insideGroup: true }, children: _jsx("div", { ref: ref, className: cn(inputGroupVariants({ state: field.disabled ? 'disabled' : 'default' }), className), "data-disabled": field.disabled ? 'true' : undefined, ...props, ...(field.insideField ? designSlot('Field', 'control') : {}), ...capture }) }));
});
export const InputGroupAddon = forwardRef(function InputGroupAddon({ className, ...props }, ref) {
    return (_jsx("span", { ref: ref, className: cn('inline-flex shrink-0 items-center justify-center text-content-muted', className), ...props, ...designSlot('InputGroup', 'addon') }));
});
export const InputGroupAction = forwardRef(function InputGroupAction({ children, className, ...props }, ref) {
    const group = useContext(InputGroupContext);
    const action = cloneElement(children, {
        className: cn(children.props.className, 'focus-visible:bg-surface-selected focus-visible:text-content-primary focus-visible:outline-none'),
        'data-focus-ring': 'delegated',
        disabled: group?.disabled ? true : children.props.disabled,
    });
    return (_jsx("span", { ref: ref, className: cn('inline-flex shrink-0 items-center justify-center', className), ...props, ...designSlot('InputGroup', 'action'), children: action }));
});
export function useInputGroupControl() {
    return useContext(InputGroupContext);
}
export const InputGroup = Object.assign(InputGroupRoot, {
    Addon: InputGroupAddon,
    Action: InputGroupAction,
});
//# sourceMappingURL=InputGroup.js.map