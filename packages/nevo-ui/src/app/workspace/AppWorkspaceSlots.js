import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../lib';
import { useAppWorkspace } from '../shell/AppShell';
import { resolveSlotMaxWidth, resolveWorkspaceSplit, } from './workspaceSizing';
function StaticWorkspaceSlotRegion({ divider = false, share, slot, slotName, }) {
    const { availableWidth } = useAppWorkspace();
    const width = resolveSlotMaxWidth(availableWidth, share);
    return (_jsx("div", { className: cn('min-w-0 flex-none overflow-hidden', divider && 'border-l border-border-subtle'), ...designSlot('AppWorkspaceSlots', slotName), style: {
            width: width === undefined ? `${share}%` : `${width}px`,
        }, children: slot.content }));
}
export function AppWorkspaceSlots({ primary, secondary, split = 'balanced', }) {
    const { availableWidth } = useAppWorkspace();
    const resolvedSplit = resolveWorkspaceSplit(split, secondary !== undefined, availableWidth);
    const layout = secondary ? split : 'single';
    const capture = useDesignMetadata('AppWorkspaceSlots', { layout });
    return (_jsxs("div", { className: "flex h-full max-w-full items-stretch overflow-hidden", style: {
            width: availableWidth === undefined ? '100%' : `${availableWidth}px`,
        }, ...capture, children: [_jsx(StaticWorkspaceSlotRegion, { share: resolvedSplit.primary, slot: primary, slotName: "primary" }), secondary ? (_jsx(StaticWorkspaceSlotRegion, { divider: true, share: resolvedSplit.secondary, slot: secondary, slotName: "secondary" })) : null] }));
}
//# sourceMappingURL=AppWorkspaceSlots.js.map