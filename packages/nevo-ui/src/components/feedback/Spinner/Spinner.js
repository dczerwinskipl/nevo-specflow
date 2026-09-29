import { jsx as _jsx } from "react/jsx-runtime";
import {} from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { Icon } from '../../foundations/Icon';
export function Spinner({ className, label, size = 'md', ...props }) {
    const capture = useDesignMetadata('Spinner', { size });
    return (_jsx("span", { className: cn('inline-flex items-center justify-center text-content-muted', className), role: label ? 'status' : undefined, "aria-label": label, "aria-hidden": label ? undefined : true, ...props, ...capture, children: _jsx("span", { className: "inline-flex", ...designSlot('Spinner', 'icon'), children: _jsx(Icon, { name: "loader", size: size, className: "animate-spin" }) }) }));
}
//# sourceMappingURL=Spinner.js.map