import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { forwardRef, } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogContent = forwardRef(function AlertDialogContent({ className, container, ...props }, ref) {
    const capture = useDesignMetadata('AlertDialog');
    return (_jsxs(AlertDialogPrimitive.Portal, { container: container, children: [_jsx(AlertDialogPrimitive.Overlay, { className: "fixed inset-0 z-40 bg-overlay" }), _jsx(AlertDialogPrimitive.Content, { ref: ref, className: cn('fixed left-1/2 top-1/2 z-50 grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 rounded-surface border border-border-default bg-surface-raised p-5 text-content-primary shadow-2xl outline-none', className), ...props, ...capture })] }));
});
export function AlertDialogHeader({ className, ...props }) {
    return _jsx("div", { className: cn('grid gap-1', className), ...props });
}
export const AlertDialogTitle = forwardRef(function AlertDialogTitle({ className, ...props }, ref) {
    return (_jsx(AlertDialogPrimitive.Title, { ref: ref, className: cn('m-0 text-title-sm text-content-primary', className), ...designSlot('AlertDialog', 'title'), ...props }));
});
export const AlertDialogDescription = forwardRef(function AlertDialogDescription({ className, ...props }, ref) {
    return (_jsx(AlertDialogPrimitive.Description, { ref: ref, className: cn('m-0 text-body-sm text-content-muted', className), ...designSlot('AlertDialog', 'description'), ...props }));
});
export function AlertDialogFooter({ className, ...props }) {
    return (_jsx("div", { className: cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className), ...designSlot('AlertDialog', 'footer'), ...props }));
}
//# sourceMappingURL=AlertDialog.js.map