import type { ReactNode } from 'react';
import { type AppWorkspaceSplitMode } from './workspaceSizing';
export type AppWorkspaceSlot = {
    content: ReactNode;
};
export type AppWorkspaceSlotsProps = {
    primary: AppWorkspaceSlot;
    secondary?: AppWorkspaceSlot;
    split?: AppWorkspaceSplitMode;
};
export declare function AppWorkspaceSlots({ primary, secondary, split, }: AppWorkspaceSlotsProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AppWorkspaceSlots.d.ts.map