import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from '../../../actions/Button';
export function PickerActions({ labels, onCancel, onDone, onNow }) {
    return (_jsxs("div", { className: "flex items-center gap-2 border-t border-border-subtle pt-3", children: [onNow && labels.now ? (_jsx(Button, { className: "mr-auto", size: "sm", variant: "ghost", onClick: onNow, children: labels.now })) : (_jsx("span", { className: "mr-auto", "aria-hidden": "true" })), _jsx(Button, { size: "sm", variant: "ghost", onClick: onCancel, children: labels.cancel }), _jsx(Button, { size: "sm", variant: "primary", onClick: onDone, children: labels.done })] }));
}
//# sourceMappingURL=PickerActions.js.map