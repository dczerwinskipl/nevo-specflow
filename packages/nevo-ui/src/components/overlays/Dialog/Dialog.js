import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { IconButton } from '../../actions/IconButton';
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
const defaultDialogLabels = { close: 'Close dialog' };
export const DialogContent = forwardRef(function DialogContent({ children, className, container, closeLabel, labels: labelsProp, showClose = true, ...props }, ref) {
    const capture = useDesignMetadata('Dialog');
    const labels = { ...defaultDialogLabels, ...labelsProp };
    return (_jsxs(DialogPrimitive.Portal, { container: container, children: [_jsx(DialogPrimitive.Overlay, { className: "fixed inset-0 z-40 bg-overlay" }), _jsxs(DialogPrimitive.Content, { ref: ref, className: cn('fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-hidden rounded-surface border border-border-default bg-surface-raised p-5 text-content-primary shadow-2xl outline-none', className), ...props, ...capture, children: [children, showClose ? (_jsx(DialogPrimitive.Close, { asChild: true, children: _jsx(IconButton, { "aria-label": closeLabel ?? labels.close, className: "absolute right-3 top-3", icon: "close", size: "sm", variant: "ghost", ...designSlot('Dialog', 'close') }) })) : null] })] }));
});
export const DialogHeader = forwardRef(function DialogHeader({ className, ...props }, ref) {
    return _jsx("div", { ref: ref, className: cn('grid gap-1 pr-8', className), ...props });
});
export const DialogTitle = forwardRef(function DialogTitle({ className, ...props }, ref) {
    return (_jsx(DialogPrimitive.Title, { ref: ref, className: cn('m-0 text-title-sm text-content-primary', className), ...designSlot('Dialog', 'title'), ...props }));
});
export const DialogDescription = forwardRef(function DialogDescription({ className, ...props }, ref) {
    return (_jsx(DialogPrimitive.Description, { ref: ref, className: cn('m-0 text-body-sm text-content-muted', className), ...designSlot('Dialog', 'description'), ...props }));
});
export const DialogBody = forwardRef(function DialogBody({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('min-h-0 overflow-y-auto', className), ...designSlot('Dialog', 'body'), ...props }));
});
export const DialogFooter = forwardRef(function DialogFooter({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className), ...designSlot('Dialog', 'footer'), ...props }));
});
//# sourceMappingURL=Dialog.js.map