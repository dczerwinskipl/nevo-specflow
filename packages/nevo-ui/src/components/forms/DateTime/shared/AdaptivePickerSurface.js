import { jsx as _jsx } from "react/jsx-runtime";
import { Dialog, Modal, ModalOverlay, Popover } from 'react-aria-components';
import { floatingSurfaceClassName } from '../../../../design-system/floatingRecipes';
import { cn } from '../../../../lib';
export function AdaptivePickerSurface({ 'aria-label': ariaLabel, children, className, presentation, }) {
    if (presentation === 'mobile') {
        return (_jsx(ModalOverlay, { className: "fixed inset-0 z-50 flex items-end justify-center bg-overlay px-2 pt-12", isDismissable: true, children: _jsx(Modal, { className: "w-full max-w-sm min-w-0 outline-none", children: _jsx(Dialog, { "aria-label": ariaLabel, className: cn('max-h-[calc(100dvh-3rem)] w-full min-w-0 overflow-y-auto rounded-t-surface border border-border-default bg-surface-raised px-4 pt-4 outline-none shadow-2xl', 'pb-[calc(1rem+env(safe-area-inset-bottom))]', className), children: children }) }) }));
    }
    return (_jsx(Popover, { className: cn(floatingSurfaceClassName, className), children: _jsx(Dialog, { "aria-label": ariaLabel, className: "outline-none", children: children }) }));
}
//# sourceMappingURL=AdaptivePickerSurface.js.map