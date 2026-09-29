import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as Dialog from '@radix-ui/react-dialog';
import { forwardRef, } from 'react';
import { designLayerMetadata, designSlot, useDesignMetadata, } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { typographyTextStyleRef } from '../../../design-system/resources';
import { IconButton } from '../../actions/IconButton';
import './Drawer.css';
export const Drawer = Dialog.Root;
export const DrawerTrigger = Dialog.Trigger;
export const DrawerClose = Dialog.Close;
export const DrawerOverlay = forwardRef(function DrawerOverlay({ className, ...props }, ref) {
    return (_jsx(Dialog.Overlay, { ref: ref, className: cn('drawer-overlay fixed inset-0 z-40 bg-overlay', className), ...props, ...designLayerMetadata({ layer: 'overlay' }) }));
});
export const DrawerContent = forwardRef(function DrawerContent({ children, className, closeLabel, container, overlayClassName, showClose = true, side = 'right', ...props }, ref) {
    const capture = useDesignMetadata('Drawer');
    return (_jsxs(Dialog.Portal, { container: container, children: [_jsx(DrawerOverlay, { className: overlayClassName }), _jsxs(Dialog.Content, { ref: ref, className: cn('drawer-panel fixed inset-y-0 z-50 flex w-full flex-col bg-surface-raised text-content-primary shadow-2xl outline-none sm:w-[28rem] md:w-[30rem]', side === 'left'
                    ? 'left-0 border-r border-border-default'
                    : 'right-0 border-l border-border-default', className), "data-side": side, ...props, ...capture, children: [children, showClose ? (_jsx(Dialog.Close, { asChild: true, children: _jsx(IconButton, { "aria-label": closeLabel, className: "absolute right-4 top-4", icon: "close", size: "sm", variant: "ghost", ...designSlot('Drawer', 'closeAction') }) })) : null] })] }));
});
export const DrawerHeader = forwardRef(function DrawerHeader({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('border-b border-divider px-5 py-4 pr-14', className), ...props, ...designSlot('Drawer', 'header') }));
});
export const DrawerTitle = forwardRef(function DrawerTitle({ className, ...props }, ref) {
    const capture = useDesignMetadata('Typography', {}, {
        textFlow: true,
        textStyleRef: typographyTextStyleRef('title-sm'),
    });
    return (_jsx(Dialog.Title, { ref: ref, className: cn('m-0 text-title-sm text-content-primary', className), ...props, ...designLayerMetadata({ layer: 'title' }), ...capture }));
});
export const DrawerDescription = forwardRef(function DrawerDescription({ className, ...props }, ref) {
    const capture = useDesignMetadata('Typography', {}, {
        textFlow: true,
        textStyleRef: typographyTextStyleRef('body-sm'),
    });
    return (_jsx(Dialog.Description, { ref: ref, className: cn('mb-0 mt-1 text-body-sm text-content-muted', className), ...props, ...designLayerMetadata({ layer: 'description' }), ...capture }));
});
export const DrawerBody = forwardRef(function DrawerBody({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', className), ...props, ...designSlot('Drawer', 'body') }));
});
export const DrawerFooter = forwardRef(function DrawerFooter({ className, ...props }, ref) {
    return (_jsx("div", { ref: ref, className: cn('flex shrink-0 flex-col-reverse gap-2 border-t border-divider px-5 py-4 sm:flex-row sm:justify-end', className), ...props, ...designSlot('Drawer', 'footer') }));
});
//# sourceMappingURL=Drawer.js.map