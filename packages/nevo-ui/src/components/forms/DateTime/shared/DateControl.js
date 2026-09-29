import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button as AriaButton, Group } from 'react-aria-components';
import { cn } from '../../../../lib';
import { iconButtonVariants } from '../../../actions/IconButton';
import { Icon } from '../../../foundations/Icon';
import { dateControlClassName, embeddedActionFocusClassName } from './dateTime.styles';
export function DateControl({ children, className, controlSlot, triggerSlot, ...props }) {
    return (_jsxs(Group, { ...props, ...controlSlot, className: cn(dateControlClassName, className), children: [children, _jsx(AriaButton, { className: cn(iconButtonVariants({ variant: 'ghost', size: 'xs' }), embeddedActionFocusClassName), "data-focus-ring": "delegated", ...triggerSlot, children: _jsx(Icon, { name: "calendar", size: "sm" }) })] }));
}
//# sourceMappingURL=DateControl.js.map